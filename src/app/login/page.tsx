import { LockKeyhole, PenLine } from "lucide-react";
import { login } from "@/app/actions";
import { SubmitButton } from "@/components/submit-button";

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  return <main className="login-page">
    <section className="login-intro"><div className="brand login-brand"><PenLine size={22} /><span>爱的小屋</span></div><h1>有些话，<br />值得慢慢说。</h1><p>记录想一起聊的问题，写一封完整的信，也让对方知道你今天过得怎样。</p><blockquote>“这里没有围观者，只有我们。”</blockquote></section>
    <section className="login-panel" aria-labelledby="login-title">
      <LockKeyhole size={22} /><p className="eyebrow">私人入口</p><h2 id="login-title">回到我们的空间</h2><p className="muted">仅限预先设置的两位成员登录。</p>
      {params.setup && <div className="notice">尚未配置 Supabase。请参照 README 完成环境变量和数据库初始化。</div>}
      {params.error && <div className="error" role="alert">{params.error === "member" ? "这个账号不是爱的小屋成员。" : params.error}</div>}
      <form action={login} className="form-stack">
        <label>邮箱<input name="email" type="email" autoComplete="email" required /></label>
        <label>密码<input name="password" type="password" autoComplete="current-password" minLength={8} required /></label>
        <SubmitButton pendingText="正在进入…">进入爱的小屋</SubmitButton>
      </form>
    </section>
  </main>;
}
