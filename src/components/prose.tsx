/**
 * 纯文本正文的排版：按空行切段，每段包一个 <p>（段首缩进在 CSS 里统一处理）；
 * 很短的末段（通常是落款）右对齐，不缩进。
 * 始终以文本节点渲染，不解析任何标记，保持"只存纯文本"的约定。
 *
 * 注意：这里**必须**每一段都包 <p>，单段也要包。
 * 早先单段是直接返回裸文本，于是"段首缩进"落不到正文上——
 * 容器的 text-indent 只会作用在第一个块级子元素（心情标签）那行。
 */
export function Prose({ text, signOff = false }: { text: string; signOff?: boolean }) {
  const paragraphs = text.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  if (!paragraphs.length) return null;
  return <>{paragraphs.map((part, index) => {
    const isSignOff = signOff && index === paragraphs.length - 1 && part.length <= 12;
    return <p key={index} className={isSignOff ? "sign-off" : undefined}>{part}</p>;
  })}</>;
}
