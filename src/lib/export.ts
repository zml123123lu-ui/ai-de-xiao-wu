/**
 * 导出备份：把两人的全部内容拼成 Markdown 或 JSON。
 * 这里是纯函数，不碰数据库也不碰请求，方便单测。
 */
export type ExportMember = { id: string; display_name: string };

export type ExportReply = {
  body: string;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  author?: ExportMember | null;
};

export type ExportDiscussion = {
  id: string;
  title: string;
  body: string;
  status: string;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  author?: ExportMember | null;
  replies: ExportReply[];
};

export type ExportLetter = {
  id: string;
  title: string;
  body: string;
  sent_at: string | null;
  read_at: string | null;
  reply_to_id: string | null;
  sender?: ExportMember | null;
  recipient?: ExportMember | null;
};

export type ExportStatus = {
  status_date: string;
  mood: string;
  body: string;
  updated_at: string;
  author?: ExportMember | null;
};

export type ExportBundle = {
  exportedAt: string;
  members: ExportMember[];
  discussions: ExportDiscussion[];
  letters: ExportLetter[];
  statuses: ExportStatus[];
};

const stamp = (value: string | null | undefined) =>
  value ? new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", dateStyle: "long", timeStyle: "short" }).format(new Date(value)) : "—";

const day = (value: string) =>
  new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", dateStyle: "long" }).format(new Date(`${value}T12:00:00+08:00`));

const name = (member?: ExportMember | null) => member?.display_name ?? "（已注销）";

export function exportCounts(bundle: ExportBundle) {
  return {
    discussions: bundle.discussions.length,
    replies: bundle.discussions.reduce((sum, item) => sum + item.replies.length, 0),
    letters: bundle.letters.length,
    draftLetters: bundle.letters.filter((letter) => letter.sent_at === null).length,
    statuses: bundle.statuses.length,
  };
}

export function buildMarkdown(bundle: ExportBundle): string {
  const counts = exportCounts(bundle);
  const out: string[] = [];

  out.push("# 爱的小屋 · 备份", "");
  out.push(`- 导出时间：${stamp(bundle.exportedAt)}`);
  out.push(`- 成员：${bundle.members.map((member) => member.display_name).join("、") || "—"}`);
  const letterNote = counts.draftLetters ? `${counts.letters} 封信（其中 ${counts.draftLetters} 封未寄出的草稿）` : `${counts.letters} 封信`;
  out.push(`- 内容：${counts.discussions} 个问题（${counts.replies} 条回复）· ${letterNote} · ${counts.statuses} 条每日状态`);
  out.push("", "> 全部为原始纯文本，未做任何改写。", "");

  out.push("---", "", "## 问题", "");
  if (!bundle.discussions.length) out.push("（还没有问题）", "");
  bundle.discussions.forEach((item, index) => {
    out.push(`### ${index + 1}. ${item.title}${item.deleted_at ? "（已删除）" : ""}`, "");
    out.push(`- 发起人：${name(item.author)}`);
    out.push(`- 时间：${stamp(item.created_at)}${item.edited_at ? `（编辑于 ${stamp(item.edited_at)}）` : ""}`);
    out.push(`- 状态：${item.status === "open" ? "讨论中" : "已聊完"}`, "");
    if (item.deleted_at) out.push("（作者已删除这篇内容）", "");
    else out.push(item.body, "");
    if (item.replies.length) {
      out.push(`**回复（${item.replies.length} 条）**`, "");
      item.replies.forEach((reply, replyIndex) => {
        out.push(`${replyIndex + 1}. **${name(reply.author)}** · ${stamp(reply.created_at)}${reply.edited_at ? "（已编辑）" : ""}`);
        out.push(reply.deleted_at ? "   （此条已删除）" : reply.body.split("\n").map((line) => `   ${line}`).join("\n"), "");
      });
    }
    out.push("---", "");
  });

  out.push("## 信件", "");
  if (!bundle.letters.length) out.push("（还没有信件）", "");
  bundle.letters.forEach((letter) => {
    out.push(`### ${letter.title}`, "");
    out.push(`- 写信人：${name(letter.sender)} → ${name(letter.recipient)}`);
    out.push(`- 寄出：${stamp(letter.sent_at)}　已读：${letter.read_at ? stamp(letter.read_at) : "尚未阅读"}`);
    if (letter.reply_to_id) out.push("- 这是一封回信");
    out.push("", letter.body, "", "---", "");
  });

  out.push("## 每日状态", "");
  if (!bundle.statuses.length) out.push("（还没有每日状态）", "");
  bundle.statuses.forEach((status) => {
    out.push(`### ${day(status.status_date)}`, "", `**${name(status.author)}** · ${status.mood} · 更新于 ${stamp(status.updated_at)}`, "", status.body, "");
  });

  return out.join("\n");
}

export function buildJson(bundle: ExportBundle): string {
  return JSON.stringify(
    {
      site: "爱的小屋",
      exportedAt: bundle.exportedAt,
      counts: exportCounts(bundle),
      members: bundle.members,
      discussions: bundle.discussions,
      letters: bundle.letters,
      dailyStatuses: bundle.statuses,
    },
    null,
    2,
  );
}

function exportDateStamp(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

/** 中文文件名 + ASCII 兜底名（Content-Disposition 用得到）。 */
export function exportFilenames(format: "md" | "json", date = new Date()) {
  const day = exportDateStamp(date);
  return { utf8: `爱的小屋-备份-${day}.${format}`, ascii: `ai-de-xiao-wu-backup-${day}.${format}` };
}
