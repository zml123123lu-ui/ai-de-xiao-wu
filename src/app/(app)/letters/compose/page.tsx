import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { SubmitButton } from "@/components/submit-button";
import { getPartner, requireUser } from "@/lib/auth";
import type { Letter } from "@/lib/types";

/** 从对方来信里挑一句值得回应的，作为可删掉的引用。 */
function quoteFrom(body: string, max = 42) {
  const lines = body.split("\n").map((line) => line.trim()).filter(Boolean);
  const pick = lines.find((line) => line.length >= 8 && !line.endsWith("：")) ?? lines[0] ?? "";
  return pick.length > max ? `${pick.slice(0, max)}…` : pick;
}

export default async function ComposePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const { supabase, user } = await requireUser();
  const partner = await getPartner(user.id);

  let draft: Letter | null = null;
  if (params.id) {
    const { data } = await supabase
      .from("letters")
      .select("*")
      .eq("id", params.id)
      .eq("sender_id", user.id)
      .eq("status", "draft")
      .single();
    draft = data as Letter | null;
  }

  // 回信：只能回自己收到过的信
  let origin: Letter | null = null;
  if (!draft && params.replyTo) {
    const { data } = await supabase
      .from("letters")
      .select("*, sender:profiles!letters_sender_id_fkey(id, display_name, avatar_color)")
      .eq("id", params.replyTo)
      .eq("recipient_id", user.id)
      .eq("status", "sent")
      .maybeSingle();
    origin = data as Letter | null;
  }

  const recipient = origin?.sender ?? partner;
  const recipientId = origin?.sender_id ?? partner?.id ?? "";
  const defaultTitle = draft?.title ?? (origin ? `回：${origin.title}` : undefined);
  const defaultBody = draft?.body ?? (origin ? `${origin.sender?.display_name ?? "你"}：\n\n你写：「${quoteFrom(origin.body)}」\n\n` : undefined);

  return (
    <div className="page letter-compose">
      <Link className="back-link" href={origin ? `/letters/${origin.id}` : "/letters?tab=drafts"}>
        <ArrowLeft size={17} />返回信件
      </Link>
      <header className="editor-header">
        <p className="eyebrow">写给 {recipient?.display_name ?? "对方"}</p>
        <h1>{draft ? "继续写完这封信" : origin ? "写一封回信" : "让话在这里慢下来"}</h1>
        <p>{origin ? `这是对《${origin.title}》的回信，引用可以删掉。寄出后正文不能再修改。` : "寄出后正文不能再修改。保存为草稿时，只有你自己能看见。"}</p>
      </header>
      {params.error && <div className="error">{params.error}</div>}
      <form className="letter-paper form-stack" action="/api/letters/save" method="post">
        <input type="hidden" name="id" value={draft?.id ?? ""} />
        <input type="hidden" name="recipientId" value={recipientId} />
        <input type="hidden" name="replyToId" value={draft?.reply_to_id ?? origin?.id ?? ""} />
        <label>
          信的题目
          <input name="title" defaultValue={defaultTitle} placeholder="写一个只有你们能懂的题目" required maxLength={120} />
        </label>
        <label>
          正文
          <textarea name="body" defaultValue={defaultBody} placeholder={`亲爱的${recipient?.display_name ?? "你"}：\n\n我想认真地和你说……`} rows={20} required maxLength={12000} />
        </label>
        <div className="letter-sign">写信人：我</div>
        <div className="form-actions split">
          <SubmitButton className="button secondary" pendingText="正在保存…">保存草稿</SubmitButton>
          <SubmitButton formAction="/api/letters/send" pendingText="正在寄出…">正式寄出</SubmitButton>
        </div>
      </form>
    </div>
  );
}
