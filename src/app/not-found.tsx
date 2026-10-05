import Link from "next/link";
export default function NotFound() { return <main className="center-page"><h1>这里没有这页内容</h1><p>它可能已经离开，或者你没有访问权限。</p><Link className="button primary" href="/today">回到今日</Link></main>; }
