import { describe, expect, it } from "vitest";
import { isValidMonth, monthBounds, monthGrid, moodsOfDay, shiftDay, shiftMonth, summarizeMonth } from "./calendar";

describe("月历", () => {
  it("识别合法月份", () => {
    expect(isValidMonth("2026-10")).toBe(true);
    expect(isValidMonth("2026-13")).toBe(false);
    expect(isValidMonth("2026-1")).toBe(false);
    expect(isValidMonth("2026-10-05")).toBe(false);
  });

  it("算出月份边界（含闰年二月）", () => {
    expect(monthBounds("2026-10")).toEqual({ start: "2026-10-01", end: "2026-10-31", days: 31 });
    expect(monthBounds("2026-02")).toEqual({ start: "2026-02-01", end: "2026-02-28", days: 28 });
    expect(monthBounds("2024-02")).toEqual({ start: "2024-02-01", end: "2024-02-29", days: 29 });
  });

  it("跨年移动月份", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-10", -3)).toBe("2026-07");
  });

  it("前后一天跨月跨年", () => {
    expect(shiftDay("2026-10-01", -1)).toBe("2026-09-30");
    expect(shiftDay("2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftDay("2024-02-28", 1)).toBe("2024-02-29");
  });

  it("网格按周补齐且格子数正确", () => {
    const grid = monthGrid("2026-10");
    const flat = grid.flat();
    expect(flat.filter(Boolean)).toHaveLength(31);
    expect(flat.length % 7).toBe(0);
    // 2026-10-01 是周四 → 前面应有 4 个空格（周日开头）
    expect(flat.slice(0, 4).every((cell) => cell === null)).toBe(true);
    expect(flat[4]).toBe("2026-10-01");
    expect(grid.every((week) => week.length === 7)).toBe(true);
  });

  it("统计本月记录与最长连续天数", () => {
    const statuses = [
      { author_id: "me", status_date: "2026-10-01", mood: "平静" },
      { author_id: "her", status_date: "2026-10-01", mood: "很好" },
      { author_id: "me", status_date: "2026-10-02", mood: "疲惫" },
      { author_id: "me", status_date: "2026-10-03", mood: "平静" },
      { author_id: "her", status_date: "2026-10-03", mood: "低落" },
      { author_id: "her", status_date: "2026-10-10", mood: "很好" },
    ];
    expect(summarizeMonth(statuses, "me", "her")).toEqual({ mine: 3, theirs: 3, both: 2, longest: 3, total: 4 });
  });

  it("取出某天两人的心情", () => {
    const statuses = [
      { author_id: "me", status_date: "2026-10-05", mood: "疲惫" },
      { author_id: "her", status_date: "2026-10-05", mood: "平静" },
    ];
    expect(moodsOfDay(statuses, "2026-10-05", "me", "her")).toEqual({ mine: "疲惫", theirs: "平静" });
    expect(moodsOfDay(statuses, "2026-10-06", "me", "her")).toEqual({ mine: null, theirs: null });
  });
});
