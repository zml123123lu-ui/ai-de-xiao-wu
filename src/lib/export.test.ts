import { describe, expect, it } from "vitest";
import { buildJson, buildMarkdown, exportCounts, exportFilenames, type ExportBundle } from "./export";

const bundle: ExportBundle = {
  exportedAt: "2026-10-05T06:00:00.000Z",
  members: [
    { id: "u1", display_name: "小九" },
    { id: "u2", display_name: "阿澜" },
  ],
  discussions: [
    {
      id: "d1",
      title: "最近有哪件事让你觉得我没有真正听懂你？",
      body: "昨天你说到工作的时候停了一下。",
      status: "open",
      created_at: "2026-10-02T04:00:00.000Z",
      edited_at: null,
      deleted_at: null,
      author: { id: "u1", display_name: "小九" },
      replies: [
        { body: "有。上周三我说不想做饭。", created_at: "2026-10-03T04:00:00.000Z", edited_at: null, deleted_at: null, author: { id: "u2", display_name: "阿澜" } },
        { body: "这条删了", created_at: "2026-10-03T05:00:00.000Z", edited_at: null, deleted_at: "2026-10-04T00:00:00.000Z", author: { id: "u2", display_name: "阿澜" } },
      ],
    },
  ],
  letters: [
    { id: "l1", title: "写在你出差第三天", body: "阿澜：\n\n椅子我搬回屋里了。", sent_at: "2026-10-03T04:00:00.000Z", read_at: null, reply_to_id: null, sender: { id: "u1", display_name: "小九" }, recipient: { id: "u2", display_name: "阿澜" } },
    { id: "l2", title: "回：写在你出差第三天", body: "我记住了。", sent_at: "2026-10-03T06:00:00.000Z", read_at: "2026-10-03T07:00:00.000Z", reply_to_id: "l1", sender: { id: "u2", display_name: "阿澜" }, recipient: { id: "u1", display_name: "小九" } },
  ],
  statuses: [
    { status_date: "2026-10-05", mood: "平静", body: "报表交了。", updated_at: "2026-10-05T05:00:00.000Z", author: { id: "u1", display_name: "小九" } },
  ],
};

describe("导出备份", () => {
  it("统计数量", () => {
    expect(exportCounts(bundle)).toEqual({ discussions: 1, replies: 2, letters: 2, draftLetters: 0, statuses: 1 });
  });

  it("Markdown 覆盖四类内容并标出已删除与回信关系", () => {
    const md = buildMarkdown(bundle);
    expect(md).toContain("# 爱的小屋 · 备份");
    expect(md).toContain("## 问题");
    expect(md).toContain("## 信件");
    expect(md).toContain("## 每日状态");
    expect(md).toContain("最近有哪件事让你觉得我没有真正听懂你？");
    expect(md).toContain("（此条已删除）");
    expect(md).toContain("这是一封回信");
    expect(md).toContain("椅子我搬回屋里了。");
  });

  it("保留原始正文，不改写换行", () => {
    const md = buildMarkdown(bundle);
    expect(md).toContain("阿澜：\n\n椅子我搬回屋里了。");
  });

  it("JSON 可解析且包含全部实体", () => {
    const parsed = JSON.parse(buildJson(bundle));
    expect(parsed.counts).toEqual({ discussions: 1, replies: 2, letters: 2, draftLetters: 0, statuses: 1 });
    expect(parsed.members).toHaveLength(2);
    expect(parsed.discussions[0].replies).toHaveLength(2);
    expect(parsed.dailyStatuses[0].mood).toBe("平静");
  });

  it("文件名用上海日期，且带 ASCII 兜底名", () => {
    const names = exportFilenames("md", new Date("2026-10-04T20:00:00.000Z")); // 上海时间已是 10-05
    expect(names.utf8).toBe("爱的小屋-备份-2026-10-05.md");
    expect(names.ascii).toBe("ai-de-xiao-wu-backup-2026-10-05.json".replace(".json", ".md"));
  });

  it("草稿会被计入并标注", () => {
    const withDraft: ExportBundle = { ...bundle, letters: [...bundle.letters, { id: "l3", title: "（草稿）关于过年", body: "先写下来。", sent_at: null, read_at: null, reply_to_id: null, sender: { id: "u2", display_name: "阿澜" }, recipient: { id: "u1", display_name: "小九" } }] };
    expect(exportCounts(withDraft).draftLetters).toBe(1);
    expect(buildMarkdown(withDraft)).toContain("其中 1 封未寄出的草稿");
  });

  it("空数据也能导出", () => {
    const empty: ExportBundle = { exportedAt: bundle.exportedAt, members: [], discussions: [], letters: [], statuses: [] };
    const md = buildMarkdown(empty);
    expect(md).toContain("（还没有问题）");
    expect(md).toContain("（还没有信件）");
    expect(md).toContain("（还没有每日状态）");
  });
});
