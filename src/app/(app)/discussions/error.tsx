"use client";

export default function DiscussionsError({ reset }: { reset: () => void }) {
  return (
    <div className="page narrow-page">
      <div className="empty-state">
        <h1>问题暂时没有加载出来</h1>
        <p>请重新加载；如果仍然出现，我会继续检查数据库连接。</p>
        <button className="button primary" onClick={reset}>重新加载</button>
      </div>
    </div>
  );
}
