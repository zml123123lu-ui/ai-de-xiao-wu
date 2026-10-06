import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { getPartner, requireUser } from "@/lib/auth";
import {
  isValidMonth,
  monthBounds,
  monthGrid,
  moodsOfDay,
  shiftMonth,
  summarizeMonth,
  type ReviewStatus,
} from "@/lib/calendar";
import { getShanghaiDate } from "@/lib/domain";

const WEEK_LABELS = ["日", "一", "二", "三", "四", "五", "六"];

export default async function ReviewPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const { supabase, user, profile } = await requireUser();
  const today = getShanghaiDate();
  const month = isValidMonth(params.month ?? "") ? params.month! : today.slice(0, 7);
  const { start, end } = monthBounds(month);
  // 注意：这里保持串行。曾经改成 Promise.all 并行，结果"免刷新更新"失灵
  // （后端已返回新内容，界面却长时间不变）——正确性优先于那 230ms。
  const partner = await getPartner(user.id);
  const { data } = await supabase
    .from("daily_statuses")
    .select("author_id, status_date, mood")
    .gte("status_date", start)
    .lte("status_date", end);
  const statuses = (data ?? []) as ReviewStatus[];
  const summary = summarizeMonth(statuses, user.id, partner?.id ?? "");
  const weeks = monthGrid(month);
  const [year, mon] = month.split("-");
  const partnerName = partner?.display_name ?? "对方";
  const isCurrentMonth = month === today.slice(0, 7);

  return <div className="page reading-page">
    <Link className="back-link" href={`/today?date=${today}`}><ArrowLeft size={17} />回到今天</Link>
    <header className="page-header">
      <div><p className="eyebrow">这些日子</p><h1>{year} 年 {Number(mon)} 月</h1><p>这个月里，哪一天有人留下了状态。</p></div>
      <div className="header-actions">
        <Link className="button secondary" aria-label="上个月" href={`/review?month=${shiftMonth(month, -1)}`}><ChevronLeft size={17} /></Link>
        {!isCurrentMonth && <Link className="button secondary" href="/review">回到本月</Link>}
        <Link className="button secondary" aria-label="下个月" href={`/review?month=${shiftMonth(month, 1)}`}><ChevronRight size={17} /></Link>
      </div>
    </header>

    <section className="review-summary" aria-label="本月回顾">
      <div><strong>{summary.mine}</strong><span>我写了几天</span></div>
      <div><strong>{summary.theirs}</strong><span>{partnerName}写了几天</span></div>
      <div><strong>{summary.both}</strong><span>两人都写的天数</span></div>
      <div><strong>{summary.longest}</strong><span>最长连续天数</span></div>
    </section>

    <div className="month-legend">
      <span><i className="on-mine" />{profile.display_name}</span>
      <span><i className="on-theirs" />{partnerName}</span>
    </div>

    <div className="month-grid" role="grid" aria-label={`${year} 年 ${Number(mon)} 月`}>
      {WEEK_LABELS.map((label) => <div className="month-weekday" role="columnheader" key={label}>周{label}</div>)}
      {weeks.flat().map((day, index) => {
        if (day === null) return <div className="month-cell empty" key={`empty-${index}`} />;
        const moods = moodsOfDay(statuses, day, user.id, partner?.id ?? "");
        const mine = moods.mine ? `我记录了${moods.mine}` : "我没有记录";
        const theirs = moods.theirs ? `${partnerName}记录了${moods.theirs}` : `${partnerName}没有记录`;
        return <Link className={`month-cell${day === today ? " today" : ""}`} key={day} href={`/today?date=${day}`}>
          <span className="month-day">{Number(day.slice(8))}</span>
          <span className="month-moods">
            {moods.mine && <em className="on-mine">{moods.mine}</em>}
            {moods.theirs && <em className="on-theirs">{moods.theirs}</em>}
          </span>
          <span className="month-dots" aria-hidden="true"><i className={moods.mine ? "on-mine" : ""} /><i className={moods.theirs ? "on-theirs" : ""} /></span>
          <span className="sr-only">{day}：{mine}；{theirs}</span>
        </Link>;
      })}
    </div>
    <p className="month-hint">点任意一天，可以回到那天的状态。</p>
  </div>;
}
