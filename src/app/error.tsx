"use client";
export default function ErrorPage({ reset }: { reset: () => void }) { return <main className="center-page"><h1>刚才没有连上</h1><p>内容没有丢失，可以再试一次。</p><button className="button primary" onClick={reset}>重新加载</button></main>; }
