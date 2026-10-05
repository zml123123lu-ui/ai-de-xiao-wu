"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

/**
 * 免刷新同步：页面可见时低频刷新服务端数据，回到标签页时立即刷新。
 * syncKey 由布局传入（对方最新一条通知的时间）——它只会因为"有新内容"而变化，
 * 因此自己把通知标记为已读不会误报。
 */
export function AutoRefresh({ syncKey, intervalMs = 20000 }: { syncKey: string; intervalMs?: number }) {
  const router = useRouter();
  const [notice, setNotice] = useState(false);
  const busy = useRef(false);
  const seen = useRef(syncKey);

  useEffect(() => {
    if (!syncKey || syncKey === seen.current) return;
    seen.current = syncKey;
    setNotice(true);
    const timer = setTimeout(() => setNotice(false), 3600);
    return () => clearTimeout(timer);
  }, [syncKey]);

  useEffect(() => {
    const isEditing = () => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return false;
      return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable;
    };
    // 刚有过交互（点击 / 按键 / 提交表单）时不要刷新：
    // 否则 router.refresh() 会抢在进行中的跳转前面，把表单提交后的 redirect 顶掉。
    let lastActivity = 0;
    const markActivity = () => { lastActivity = Date.now(); };
    const COOLDOWN_MS = 3000;

    const refresh = () => {
      if (busy.current || document.visibilityState !== "visible" || isEditing()) return;
      if (Date.now() - lastActivity < COOLDOWN_MS) return;
      busy.current = true;
      router.refresh();
      setTimeout(() => { busy.current = false; }, 1500);
    };
    // 首次提前到 6 秒：把"新内容最坏等待"从一整个周期（20s）降到约 6 秒。
    // 之后仍按固定周期轮询，避免频繁请求。
    const firstTick = setTimeout(refresh, Math.min(6000, intervalMs));
    const timer = setInterval(refresh, intervalMs);
    // 只保留"切回标签页"这一种立即刷新；不再监听 window focus
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("pointerdown", markActivity, true);
    document.addEventListener("keydown", markActivity, true);
    document.addEventListener("submit", markActivity, true);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(firstTick);
      clearInterval(timer);
      document.removeEventListener("pointerdown", markActivity, true);
      document.removeEventListener("keydown", markActivity, true);
      document.removeEventListener("submit", markActivity, true);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router, intervalMs]);

  return <div className={`refresh-pill${notice ? " show" : ""}`} role="status" aria-live="polite">
    <RefreshCw size={13} /><span>有新动静，已经更新</span>
  </div>;
}
