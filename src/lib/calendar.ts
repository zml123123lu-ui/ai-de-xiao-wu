/**
 * 月历与回顾统计。全部按上海日历计算，纯函数，方便单测。
 * 日期一律用 "YYYY-MM-DD" 字符串，月份用 "YYYY-MM"。
 */
export type ReviewStatus = { author_id: string; status_date: string; mood: string };

export function isValidMonth(value: string) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

const pad = (value: number) => String(value).padStart(2, "0");

/** 某月的第一天、最后一天与总天数 */
export function monthBounds(month: string) {
  const [year, mon] = month.split("-").map(Number);
  const days = new Date(Date.UTC(year, mon, 0)).getUTCDate(); // 第 0 天 = 上个月最后一天
  return { start: `${month}-01`, end: `${month}-${pad(days)}`, days };
}

export function shiftMonth(month: string, delta: number) {
  const [year, mon] = month.split("-").map(Number);
  const moved = new Date(Date.UTC(year, mon - 1 + delta, 1));
  return `${moved.getUTCFullYear()}-${pad(moved.getUTCMonth() + 1)}`;
}

export function shiftDay(value: string, delta: number) {
  const moved = new Date(`${value}T12:00:00+08:00`);
  moved.setUTCDate(moved.getUTCDate() + delta);
  return moved.toISOString().slice(0, 10);
}

/** 月历网格：每周 7 格，周日开头；空白处为 null，便于直接铺格子 */
export function monthGrid(month: string): (string | null)[][] {
  const { days } = monthBounds(month);
  const [year, mon] = month.split("-").map(Number);
  const lead = new Date(Date.UTC(year, mon - 1, 1)).getUTCDay();
  const cells: (string | null)[] = Array.from({ length: lead }, () => null);
  for (let day = 1; day <= days; day += 1) cells.push(`${month}-${pad(day)}`);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let index = 0; index < cells.length; index += 7) weeks.push(cells.slice(index, index + 7));
  return weeks;
}

export function summarizeMonth(statuses: ReviewStatus[], userId: string, partnerId: string) {
  const mine = new Set(statuses.filter((item) => item.author_id === userId).map((item) => item.status_date));
  const theirs = new Set(statuses.filter((item) => item.author_id === partnerId).map((item) => item.status_date));
  const both = [...mine].filter((day) => theirs.has(day)).length;

  // 最长连续「至少有一人留下状态」的天数
  const active = [...new Set(statuses.map((item) => item.status_date))].sort();
  let longest = 0;
  let current = 0;
  let previous = "";
  for (const day of active) {
    current = previous && day === shiftDay(previous, 1) ? current + 1 : 1;
    if (current > longest) longest = current;
    previous = day;
  }

  return { mine: mine.size, theirs: theirs.size, both, longest, total: active.length };
}

/** 把某天的两条状态按「我 / 对方」拆开，供月历格子显示心情 */
export function moodsOfDay(statuses: ReviewStatus[], day: string, userId: string, partnerId: string) {
  const mine = statuses.find((item) => item.status_date === day && item.author_id === userId)?.mood ?? null;
  const theirs = statuses.find((item) => item.status_date === day && item.author_id === partnerId)?.mood ?? null;
  return { mine, theirs };
}
