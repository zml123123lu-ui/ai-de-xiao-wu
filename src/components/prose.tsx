/**
 * 纯文本正文的排版：按空行切段，段首缩进；很短的末段（通常是落款）右对齐。
 * 始终以文本节点渲染，不解析任何标记，保持"只存纯文本"的约定。
 */
export function Prose({ text, signOff = false }: { text: string; signOff?: boolean }) {
  const paragraphs = text.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  if (paragraphs.length <= 1) return <>{text}</>;
  return <>{paragraphs.map((part, index) => {
    const isSignOff = signOff && index === paragraphs.length - 1 && part.length <= 12;
    return <p key={index} className={isSignOff ? "sign-off" : undefined}>{part}</p>;
  })}</>;
}
