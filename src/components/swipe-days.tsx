"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * 手机上左右滑动切换日期。
 * 只在"横向意图明显"时才切换：横向位移要超过 70px，且是纵向位移的 1.8 倍以上，
 * 避免用户上下滚动时误触发。到今天就停住，不会滑到未来。
 */
export function SwipeDays({ previous, next }: { previous?: string; next?: string }) {
  const router = useRouter();

  useEffect(() => {
    let startX = 0;
    let startY = 0;
    let tracking = false;

    const onStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch) return;
      startX = touch.clientX;
      startY = touch.clientY;
      tracking = true;
    };

    const onEnd = (event: TouchEvent) => {
      if (!tracking) return;
      tracking = false;
      const touch = event.changedTouches[0];
      if (!touch) return;
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.8) return;
      const target = dx < 0 ? next : previous;
      if (target) router.push(`/today?date=${target}`);
    };

    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchend", onEnd);
    };
  }, [previous, next, router]);

  return null;
}
