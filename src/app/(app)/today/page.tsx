import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight, Pencil } from "lucide-react";
import { markRead } from "@/app/actions";
import { Avatar } from "@/components/avatar";
import { MarkRead } from "@/components/mark-read";
import { Prose } from "@/components/prose";
import { SwipeDays } from "@/components/swipe-days";
import { getPartner, requireUser } from "@/lib/auth";
import { shiftDay as shiftDate } from "@/lib/calendar";
import { getShanghaiDate, isValidShanghaiDate, moods } from "@/lib/domain";
import { formatLongDate } from "@/lib/format";
import type { DailyStatus } from "@/lib/types";

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

export default async function TodayPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const { supabase, user, profile } = await requireUser();
  const today = getShanghaiDate();
  const selectedDate = isValidShanghaiDate(params.date ?? "") ? params.date! : today;
  const weekStart = shiftDate(selectedDate, -6);

  const partner = await getPartner(user.id);
  // 一次查询同时取回"这一周"（含当天）：比"当天 + 一周"两次查询少一趟跨洋往返
  // （每次约 230ms）。仍然是串行——并行会让免刷新更新失灵。
  const { data: weekRows } = await supabase
    .from("daily_statuses")
    .select("*, author:profiles!daily_statuses_author_id_fkey(id, display_name, avatar_color)")
    .gte("status_date", weekStart)
    .lte("status_date", selectedDate);
  const week = (weekRows ?? []) as DailyStatus[];
  const statuses = week.filter((row) => row.status_date === selectedDate);
  const mine = statuses.find((status) => status.author_id === user.id);
  const theirs = statuses.find((status) => status.author_id !== user.id);
  const isToday = selectedDate === today;
  const days = Array.from({ length: 7 }, (_, index) => shiftDate(weekStart, index));

  return <div className="page narrow-page">
    <SwipeDays previous={shiftDate(selectedDate, -1)} next={isToday ? undefined : shiftDate(selectedDate, 1)} />
    <header className="page-header today-header"><div><p className="eyebrow">两个人的今天</p><h1>{isToday ? "今天过得怎么样？" : formatLongDate(selectedDate)}</h1><p>不必组织成完整的故事，只要让对方知道你此刻在哪里。</p></div><div className="header-actions"><Link className="button secondary" href={`/review?month=${selectedDate.slice(0, 7)}`}>月历</Link><DatePicker selectedDate={selectedDate} today={today} /></div></header>
    <div className="date-nav"><Link aria-label="前一天" href={`/today?date=${shiftDate(selectedDate, -1)}`}><ChevronLeft /></Link><span>{formatLongDate(selectedDate)}</span>{!isToday ? <Link aria-label="后一天" href={`/today?date=${shiftDate(selectedDate, 1)}`}><ChevronRight /></Link> : <span className="disabled"><ChevronRight /></span>}</div>
    <nav className="week-strip" aria-label="最近七天">
      {days.map((day) => {
        const mineOn = week.some((row) => row.status_date === day && row.author_id === user.id);
        const theirsOn = week.some((row) => row.status_date === day && row.author_id !== user.id);
        const weekday = WEEKDAYS[new Date(`${day}T12:00:00+08:00`).getUTCDay()];
        return <Link key={day} href={`/today?date=${day}`} aria-current={day === selectedDate ? "date" : undefined} className={`week-day${day === selectedDate ? " current" : ""}${day === today ? " today" : ""}`}>
          <span className="num">{Number(day.slice(8))}</span>
          <span className="weekday">周{weekday}</span>
          <span className="dots" aria-hidden="true"><i className={mineOn ? "on-mine" : ""} /><i className={theirsOn ? "on-theirs" : ""} /></span>
          <span className="sr-only">{day === today ? "今天，" : ""}我{mineOn ? "有" : "没有"}记录，{partner?.display_name ?? "对方"}{theirsOn ? "有" : "没有"}记录</span>
        </Link>;
      })}
    </nav>
    {theirs && selectedDate === today && <MarkRead action={markRead} kind="daily_status" resourceId={theirs.id} />}
    {params.error && <div className="error" role="alert">{params.error}</div>}
    {params.saved && <div className="success" role="status">今天的状态已让对方看见。</div>}
    <section className="status-grid" aria-label={`${selectedDate}的每日状态`}>
      <article className="status-sheet mine"><div className="sheet-heading"><div><Avatar profile={profile} /><span><strong>{profile.display_name}</strong><small>我的状态</small></span></div>{isToday && <Pencil size={17} />}</div>
        {isToday ? <form action="/api/today/status" method="post" className="form-stack status-form"><fieldset><legend>今天更接近哪种感觉？</legend><div className="mood-options">{moods.map((mood) => <label key={mood}><input type="radio" name="mood" value={mood} defaultChecked={mine?.mood === mood || (!mine && mood === "平静")} /><span>{mood}</span></label>)}</div></fieldset><label><span className="sr-only">我的今日状态</span><textarea name="body" defaultValue={mine?.body} rows={7} placeholder="今天发生了什么，身体和心里是什么感觉……" required maxLength={2000} /></label><button className="button primary" type="submit">{mine ? "更新今天" : "写下今天"}</button></form> : mine ? <StatusBody status={mine} /> : <EmptyStatus name={profile.display_name} />}
      </article>
      <article className="status-sheet"><div className="sheet-heading"><div><Avatar profile={partner ?? undefined} /><span><strong>{partner?.display_name ?? "对方"}</strong><small>对方的状态</small></span></div></div>{theirs ? <StatusBody status={theirs} /> : <EmptyStatus name={partner?.display_name ?? "对方"} />}</article>
    </section>
  </div>;
}

function StatusBody({ status }: { status: DailyStatus }) {
  return <div className="status-body"><span className="mood-mark">{status.mood}</span><Prose text={status.body} /><small>更新于 {new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit" }).format(new Date(status.updated_at))}</small></div>;
}

function EmptyStatus({ name }: { name: string }) {
  return <div className="empty-state quiet"><p>{name}这一天还没有留下状态。</p></div>;
}

function DatePicker({ selectedDate, today }: { selectedDate: string; today: string }) {
  return <details className="date-picker">
    <summary aria-label="选择日期"><CalendarDays size={24} /><span>选日期</span></summary>
    <form method="get" className="date-picker-popover">
      <label htmlFor="status-date">查看哪一天</label>
      <input id="status-date" type="date" name="date" defaultValue={selectedDate} max={today} required />
      <button className="button primary" type="submit">查看这天</button>
    </form>
  </details>;
}
