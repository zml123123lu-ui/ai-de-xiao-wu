-- 信件回信：给 letters 增加 reply_to_id，让"收到的信"能被直接回复，两封信连成线索。
-- ⚠️ 部署顺序：先在生产库执行本迁移，再发布使用该字段的新版本代码，否则写入会失败。

alter table public.letters
  add column if not exists reply_to_id uuid references public.letters(id) on delete set null;

create index if not exists letters_reply_to_idx on public.letters(reply_to_id);

-- 已寄出的信不可修改，reply_to_id 一并锁定
create or replace function public.protect_sent_letter()
returns trigger language plpgsql as $$
begin
  if old.status = 'sent' and (
    new.title is distinct from old.title or new.body is distinct from old.body or
    new.sender_id is distinct from old.sender_id or new.recipient_id is distinct from old.recipient_id or
    new.status is distinct from old.status or new.sent_at is distinct from old.sent_at or
    new.reply_to_id is distinct from old.reply_to_id
  ) then raise exception 'Sent letters cannot be changed'; end if;
  if old.status = 'draft' and new.status = 'sent' then new.sent_at = now(); end if;
  return new;
end $$;

-- 只允许"回"自己确实收到过、且已寄出的信
create or replace function public.is_replyable(target uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select target is null or exists (
    select 1 from public.letters
    where id = target and recipient_id = auth.uid() and status = 'sent'
  )
$$;

revoke all on function public.is_replyable(uuid) from public;
grant execute on function public.is_replyable(uuid) to authenticated;

drop policy if exists "senders create letters" on public.letters;
create policy "senders create letters" on public.letters for insert with check (
  public.is_member() and sender_id = auth.uid()
  and recipient_id = public.other_member_id(auth.uid())
  and public.is_replyable(reply_to_id)
);

drop policy if exists "senders update drafts or recipients read" on public.letters;
create policy "senders update drafts or recipients read" on public.letters for update using (
  (sender_id = auth.uid() and status = 'draft') or (recipient_id = auth.uid() and status = 'sent')
) with check (
  (sender_id = auth.uid() and public.is_replyable(reply_to_id))
  or (recipient_id = auth.uid() and status = 'sent')
);
