import Link from "next/link";
import { ArrowLeft } from "lucide-react";


export default async function NewDiscussionPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  return <div className="page reading-page"><Link className="back-link" href="/discussions"><ArrowLeft size={17} />返回问题</Link><header className="editor-header"><p className="eyebrow">发起一段对话</p><h1>你想和对方聊什么？</h1><p>具体一点，也诚实一点。这里不是为了立刻得出结论。</p></header>{params.error && <div className="error">{params.error}</div>}<form action="/api/discussions/new" method="post" className="editor form-stack"><label>问题标题<input name="title" required maxLength={120} placeholder="例如：最近有哪件事让你觉得我没有真正听懂？" /></label><label>想说的话<textarea name="body" required maxLength={5000} rows={13} placeholder="写下这件事对你的意义、你在意的部分，以及你希望听见对方怎样的真实想法……" /></label><div className="form-actions"><Link className="button secondary" href="/discussions">取消</Link><button className="button primary" type="submit">发起问题</button></div></form></div>;
}
