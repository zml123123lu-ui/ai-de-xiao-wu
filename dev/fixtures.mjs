// 本地预览用的假数据。所有日期相对"今天"计算，方便对比 /today 的当日与历史视图。
const day = 86400000;

export function shanghaiToday(offset = 0) {
  const base = new Date(Date.now() + offset * day + 8 * 3600 * 1000);
  return base.toISOString().slice(0, 10);
}

export const USERS = [
  { id: "11111111-1111-4111-8111-111111111111", email: "xiaojiu@demo.local", password: "demo-password-123", display_name: "小九" },
  { id: "22222222-2222-4222-8222-222222222222", email: "alan@demo.local", password: "demo-password-123", display_name: "阿澜" },
  // 第三个 auth 账号，但故意**没有 profiles 记录**：用来验证"非成员拿不到任何内容"
  { id: "33333333-3333-4333-8333-333333333333", email: "outsider@demo.local", password: "demo-password-123", display_name: "路人" },
];

const t = (daysAgo, hoursAgo = 0) => new Date(Date.now() - daysAgo * day - hoursAgo * 3600000).toISOString();

export function initialData() {
  const [xiaojiu, alan] = USERS;
  return {
    profiles: [
      { id: xiaojiu.id, display_name: xiaojiu.display_name, avatar_color: "#627160", created_at: t(200) },
      { id: alan.id, display_name: alan.display_name, avatar_color: "#9A5540", created_at: t(199) },
    ],
    discussions: [
      {
        id: "aaaaaaaa-0000-4000-8000-000000000001",
        author_id: xiaojiu.id,
        title: "最近有哪件事让你觉得我没有真正听懂你？",
        body: "昨天你说到工作的时候停了一下，我接了一句「那你早点睡」就过去了。后来我想，你停下来那一下，可能不是在说累，是在等我多问一句。\n\n如果最近还有别的这种时刻，你愿意告诉我吗？我想知道我错过的是什么。",
        status: "open",
        created_at: t(3), updated_at: t(0, 2), edited_at: null, deleted_at: null,
      },
      {
        id: "aaaaaaaa-0000-4000-8000-000000000002",
        author_id: alan.id,
        title: "我们要不要定一个「先停一下」的暗号？",
        body: "我发现我们真正吵起来，都是从某句话开始加速的那一刻。\n\n要不要约一个词，谁先说出口，另一个人就先不接话，各自十分钟？不是为了逃避，是为了别在最气的时候说最难收回的话。",
        status: "open",
        created_at: t(1), updated_at: t(1), edited_at: null, deleted_at: null,
      },
      {
        id: "aaaaaaaa-0000-4000-8000-000000000003",
        author_id: xiaojiu.id,
        title: "关于明年住在哪个城市",
        body: "这件事我们聊过三次，每次都在「以后再说」结束。我想这次把它聊完。",
        status: "closed",
        created_at: t(12), updated_at: t(9), edited_at: t(10), deleted_at: null,
      },
    ],
    discussion_replies: [
      { id: "bbbbbbbb-0000-4000-8000-000000000001", discussion_id: "aaaaaaaa-0000-4000-8000-000000000001", author_id: alan.id, body: "有。上周三我说「今天不想做饭」，你直接点了外卖，什么都没问。我当时其实是想让你陪我走一段路去买菜。", created_at: t(2), edited_at: null, deleted_at: null },
      { id: "bbbbbbbb-0000-4000-8000-000000000002", discussion_id: "aaaaaaaa-0000-4000-8000-000000000001", author_id: xiaojiu.id, body: "这个我记住了。以后你说「不想做饭」，我先问一句「那你想做什么」。", created_at: t(1, 20), edited_at: null, deleted_at: null },
      { id: "bbbbbbbb-0000-4000-8000-000000000003", discussion_id: "aaaaaaaa-0000-4000-8000-000000000001", author_id: alan.id, body: "好。我也想说我这边的问题：我经常在你讲事情的时候急着给方案。其实你要的可能只是有人在。", created_at: t(0, 3), edited_at: null, deleted_at: null },
      { id: "bbbbbbbb-0000-4000-8000-000000000004", discussion_id: "aaaaaaaa-0000-4000-8000-000000000003", author_id: alan.id, body: "我最在意的是离你爸妈近一点。", created_at: t(11), edited_at: null, deleted_at: null },
      { id: "bbbbbbbb-0000-4000-8000-000000000005", discussion_id: "aaaaaaaa-0000-4000-8000-000000000003", author_id: xiaojiu.id, body: "那我的担心是我这边的工作机会。要不我们各写三个最不能放弃的条件？", created_at: t(10), edited_at: null, deleted_at: null },
    ],
    letters: [
      {
        id: "cccccccc-0000-4000-8000-000000000001",
        sender_id: xiaojiu.id, recipient_id: alan.id,
        title: "写在你出差第三天",
        body: "阿澜：\n\n你走的第一天我把阳台的椅子搬回屋里了，风太大。第二天发现我其实很喜欢那把椅子在屋里，晚上坐着看书刚好。\n\n我想说的是一件很小的事：你在的时候我很少觉得房子里安静，你不在的时候我才发现安静是有形状的。\n\n不用急着回信。回来的时候带你去吃那家关门很早的馄饨。\n\n小九",
        status: "sent", created_at: t(2), updated_at: t(2), sent_at: t(2), read_at: null, reply_to_id: null,
      },
      {
        id: "cccccccc-0000-4000-8000-000000000002",
        sender_id: xiaojiu.id, recipient_id: alan.id,
        title: "关于上次那句话，我想再说清楚一点",
        body: "阿澜：\n\n那天我说「你总是这样」，是不公平的。我想说的是那一刻我很难过，而不是你一直都不好。\n\n下次我会说：我现在很难过，需要你抱一下。\n\n小九",
        status: "sent", created_at: t(6), updated_at: t(6), sent_at: t(6), read_at: t(5), reply_to_id: null,
      },
      {
        id: "cccccccc-0000-4000-8000-000000000003",
        sender_id: alan.id, recipient_id: xiaojiu.id,
        title: "回你那封写在出差第三天的信",
        body: "小九：\n\n馄饨店我记住了。椅子别搬回去，等我回来一起搬。\n\n我在酒店的窗边把你这封信读了两遍。你写「安静是有形状的」，我大概知道你说的是什么形状。\n\n阿澜",
        status: "sent", created_at: t(3), updated_at: t(3), sent_at: t(3), read_at: t(2), reply_to_id: "cccccccc-0000-4000-8000-000000000001",
      },
      {
        id: "cccccccc-0000-4000-8000-000000000004",
        sender_id: alan.id, recipient_id: xiaojiu.id,
        title: "（草稿）关于过年回谁家",
        body: "小九：\n\n这件事我想先写下来，等你心情好的时候再给你看。\n\n阿澜",
        status: "draft", created_at: t(0, 5), updated_at: t(0, 5), sent_at: null, read_at: null, reply_to_id: null,
      },
    ],
    daily_statuses: [
      { id: "dddddddd-0000-4000-8000-000000000001", author_id: xiaojiu.id, status_date: shanghaiToday(0), mood: "平静", body: "今天把拖了两周的报表交了，晚上煮了面。有一点想他。", created_at: t(0, 9), updated_at: t(0, 9) },
      { id: "dddddddd-0000-4000-8000-000000000002", author_id: alan.id, status_date: shanghaiToday(0), mood: "疲惫", body: "开了四个小时的会，脑子有点糊。但想到明天能回去，就还好。", created_at: t(0, 7), updated_at: t(0, 7) },
      { id: "dddddddd-0000-4000-8000-000000000003", author_id: xiaojiu.id, status_date: shanghaiToday(-1), mood: "低落", body: "昨天不太想说话，睡得很早。", created_at: t(1, 4), updated_at: t(1, 4) },
      { id: "dddddddd-0000-4000-8000-000000000004", author_id: alan.id, status_date: shanghaiToday(-1), mood: "很好", body: "见了老朋友，聊到很晚。", created_at: t(1, 3), updated_at: t(1, 3) },
    ],
    notifications: [
      { id: "eeeeeeee-0000-4000-8000-000000000001", recipient_id: alan.id, actor_id: xiaojiu.id, type: "discussion", resource_id: "aaaaaaaa-0000-4000-8000-000000000001", created_at: t(3), read_at: t(3) },
      { id: "eeeeeeee-0000-4000-8000-000000000002", recipient_id: alan.id, actor_id: xiaojiu.id, type: "reply", resource_id: "aaaaaaaa-0000-4000-8000-000000000001", created_at: t(0, 3), read_at: null },
      { id: "eeeeeeee-0000-4000-8000-000000000003", recipient_id: alan.id, actor_id: xiaojiu.id, type: "letter", resource_id: "cccccccc-0000-4000-8000-000000000001", created_at: t(2), read_at: null },
      { id: "eeeeeeee-0000-4000-8000-000000000004", recipient_id: alan.id, actor_id: xiaojiu.id, type: "daily_status", resource_id: "dddddddd-0000-4000-8000-000000000001", created_at: t(0, 9), read_at: null },
      { id: "eeeeeeee-0000-4000-8000-000000000005", recipient_id: xiaojiu.id, actor_id: alan.id, type: "discussion", resource_id: "aaaaaaaa-0000-4000-8000-000000000002", created_at: t(1), read_at: null },
    ],
  };
}
