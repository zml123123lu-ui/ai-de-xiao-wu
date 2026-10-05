"use client";

import { useEffect } from "react";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("app route error", error); }, [error]);
  return <div className="page narrow-page"><div className="empty-state">
    <h1>这一页没有打开</h1>
    <p>内容还在，可能是刚才网络不稳。再试一次就好。</p>
    <button className="button primary" onClick={reset} type="button">重新加载</button>
  </div></div>;
}
