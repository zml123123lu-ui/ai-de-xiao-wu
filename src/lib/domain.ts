import { z } from "zod";

export const moods = ["很好", "平静", "疲惫", "低落", "烦躁"] as const;
export type Mood = (typeof moods)[number];
export type DiscussionStatus = "open" | "closed";

const requiredText = (label: string, max: number) =>
  z.string().trim().min(1, `${label}不能为空`).max(max, `${label}不能超过 ${max} 个字`);

export const loginSchema = z.object({
  email: z.string().trim().email("请输入有效邮箱"),
  password: z.string().min(8, "密码至少 8 位").max(128),
});

export const createDiscussionSchema = z.object({
  title: requiredText("标题", 120),
  body: requiredText("正文", 5000),
});

export const updateDiscussionSchema = createDiscussionSchema.extend({
  id: z.string().uuid(),
});

export const replySchema = z.object({
  discussionId: z.string().uuid(),
  body: requiredText("回复", 5000),
});

export const updateReplySchema = z.object({
  id: z.string().uuid(),
  discussionId: z.string().uuid(),
  body: requiredText("回复", 5000),
});

export const letterSchema = z.object({
  id: z.string().uuid().optional(),
  replyToId: z.string().uuid().optional(),
  recipientId: z.string().uuid(),
  title: requiredText("标题", 120),
  body: requiredText("正文", 12000),
});

export const upsertDailyStatusSchema = z.object({
  mood: z.enum(moods),
  body: requiredText("今日状态", 2000),
});

export function getShanghaiDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function isValidShanghaiDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

export function canEditAuthoredContent(
  userId: string,
  authorId: string,
  deletedAt: string | null,
) {
  return userId === authorId && deletedAt === null;
}

export function canTransitionDiscussion(
  current: DiscussionStatus,
  next: DiscussionStatus,
  isAuthor: boolean,
) {
  return isAuthor && current !== next;
}
