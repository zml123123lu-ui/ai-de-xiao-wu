import Link from "next/link";
import { ArrowLeft, PenLine } from "lucide-react";
import { notFound } from "next/navigation";
import { markRead } from "@/app/actions";
import { Avatar } from "@/components/avatar";
import { MarkRead } from "@/components/mark-read";
import { Prose } from "@/components/prose";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import type { Letter } from "@/lib/types";

export default async function LetterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await requireUser();
  const { data } = await supabase.from("letters").select("*, sender:profiles!letters_sender_id_fkey(id, display_name, avatar_color), recipient:profiles!letters_recipient_id_fkey(id, display_name, avatar_color)").eq("id", id).eq("status", "sent").single();
  if (!data) notFound();
  const letter = data as Letter;
  const isRecipient = letter.recipient_id === user.id;

  let origin: { id: string; title: string } | null = null;
  if (letter.reply_to_id) {
    const { data: originRow } = await supabase.from("letters").select("id, title").eq("id", letter.reply_to_id).maybeSingle();
    origin = (originRow as { id: string; title: string } | null) ?? null;
  }
  const { data: replyRow } = await supabase
    .from("letters")
    .select("id, title")
    .eq("reply_to_id", id)
    .eq("status", "sent")
    .order("sent_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const reply = (replyRow as { id: string; title: string } | null) ?? null;

  return <div className="page letter-reading">
    {isRecipient && !letter.read_at && <MarkRead action={markRead} kind="letter" resourceId={id} />}
    <Link className="back-link" href="/letters"><ArrowLeft size={17} />返回信件</Link>
    <article className="opened-letter">
      <header>
        {origin && <Link className="letter-linkage" href={`/letters/${origin.id}`}>这是对《{origin.title}》的回信</Link>}
        <p className="eyebrow">{isRecipient ? `来自 ${letter.sender?.display_name}` : `写给 ${letter.recipient?.display_name}`}</p>
        <h1>{letter.title}</h1>
        <div className="letter-date">{formatDateTime(letter.sent_at!)}</div>
      </header>
      <div className="letter-body"><Prose text={letter.body} signOff /></div>
      <footer>
        <Avatar profile={letter.sender} />
        <div><strong>{letter.sender?.display_name}</strong><span>{isRecipient ? "写给你" : letter.read_at ? `对方已于 ${formatDateTime(letter.read_at)} 阅读` : "等待对方阅读"}</span></div>
        <span className="seal" aria-hidden="true">{letter.sender?.display_name?.slice(0, 1)}</span>
      </footer>
    </article>
    <div className="letter-actions">
      {isRecipient && <Link className="button primary" href={`/letters/compose?replyTo=${letter.id}`}><PenLine size={17} />回一封信</Link>}
      {!isRecipient && reply && <Link className="letter-linkage" href={`/letters/${reply.id}`}>已回信《{reply.title}》</Link>}
    </div>
  </div>;
}
