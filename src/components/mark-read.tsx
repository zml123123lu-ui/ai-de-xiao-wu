"use client";

import { useEffect, useRef } from "react";

/** 挂载后调用服务端动作标记已读，再刷新一次让未读徽标同步。 */
export function MarkRead({ action, kind, resourceId }: {
  action: (kind: "discussion" | "letter" | "daily_status", resourceId?: string) => Promise<void>;
  kind: "discussion" | "letter" | "daily_status";
  resourceId?: string;
}) {
  const done = useRef(false);
  useEffect(() => {
    if (done.current || !resourceId) return;
    done.current = true;
    // 动作内部已经 revalidatePath("/", "layout")，徽标会随之更新。
    // 这里**不再**额外 router.refresh()：它会在页面刚加载时抢在用户点击前面，
    // 把紧随其后的点击/跳转顶掉（写信保存那次就是同一个机制）。
    action(kind, resourceId).catch(() => {});
  }, [action, kind, resourceId]);
  return null;
}
