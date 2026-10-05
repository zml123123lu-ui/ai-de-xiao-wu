import { describe, expect, it } from "vitest";
import {
  canEditAuthoredContent,
  canTransitionDiscussion,
  isValidShanghaiDate,
  getShanghaiDate,
  upsertDailyStatusSchema,
} from "./domain";

describe("domain rules", () => {
  it("allows only the author to edit a non-deleted post", () => {
    expect(canEditAuthoredContent("user-a", "user-a", null)).toBe(true);
    expect(canEditAuthoredContent("user-b", "user-a", null)).toBe(false);
    expect(canEditAuthoredContent("user-a", "user-a", "2026-08-13T00:00:00Z")).toBe(false);
  });

  it("allows the author to close and reopen a discussion", () => {
    expect(canTransitionDiscussion("open", "closed", true)).toBe(true);
    expect(canTransitionDiscussion("closed", "open", true)).toBe(true);
    expect(canTransitionDiscussion("open", "closed", false)).toBe(false);
  });

  it("uses the Shanghai calendar date", () => {
    expect(getShanghaiDate(new Date("2026-08-12T16:30:00.000Z"))).toBe("2026-08-13");
  });

  it("accepts real calendar dates and rejects impossible dates", () => {
    expect(isValidShanghaiDate("2026-08-13")).toBe(true);
    expect(isValidShanghaiDate("2026-02-29")).toBe(false);
    expect(isValidShanghaiDate("2024-02-29")).toBe(true);
  });

  it("rejects an unsupported mood", () => {
    expect(
      upsertDailyStatusSchema.safeParse({ mood: "兴奋", body: "今天不错" }).success,
    ).toBe(false);
  });
});
