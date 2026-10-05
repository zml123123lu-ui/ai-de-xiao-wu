import type { createClient } from "./supabase/server";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * 把当前用户自己的未读通知标记为已读。
 * 只影响 recipient_id = userId 的行，因此不构成越权写入。
 */
export async function markNotificationsRead(
  supabase: ServerClient,
  userId: string,
  types: readonly string[],
  resourceId?: string,
) {
  const now = new Date().toISOString();
  let query = supabase
    .from("notifications")
    .update({ read_at: now })
    .eq("recipient_id", userId)
    .in("type", [...types])
    .is("read_at", null);
  if (resourceId) query = query.eq("resource_id", resourceId);
  const { error } = await query;
  if (error) console.error("markNotificationsRead failed", error.message);
}

/** 收信人打开信件时记录已读时间，并清掉对应通知。 */
export async function markLetterRead(supabase: ServerClient, userId: string, letterId: string) {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("letters")
    .update({ read_at: now })
    .eq("id", letterId)
    .eq("recipient_id", userId)
    .eq("status", "sent")
    .is("read_at", null);
  if (error) {
    console.error("markLetterRead failed", error.message);
    return null;
  }
  await markNotificationsRead(supabase, userId, ["letter"], letterId);
  return now;
}
