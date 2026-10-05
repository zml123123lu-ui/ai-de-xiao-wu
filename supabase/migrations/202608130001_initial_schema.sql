create extension if not exists pgcrypto;

create type public.discussion_status as enum ('open', 'closed');
create type public.letter_status as enum ('draft', 'sent');
create type public.mood as enum ('很好', '平静', '疲惫', '低落', '烦躁');
create type public.notification_type as enum ('discussion', 'reply', 'letter', 'daily_status');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  avatar_color text not null default '#9b664d' check (avatar_color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at timestamptz not null default now()
);

create table public.discussions (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id),
  title text not null check (char_length(title) between 1 and 120),
  body text not null check (char_length(body) between 1 and 5000),
  status public.discussion_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz
);

create table public.discussion_replies (
  id uuid primary key default gen_random_uuid(),
  discussion_id uuid not null references public.discussions(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  body text not null check (char_length(body) between 1 and 5000),
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz
);

create table public.letters (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id),
  recipient_id uuid not null references public.profiles(id),
  title text not null check (char_length(title) between 1 and 120),
  body text not null check (char_length(body) between 1 and 12000),
  status public.letter_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz,
  read_at timestamptz,
  constraint letter_not_to_self check (sender_id <> recipient_id),
  constraint sent_letter_has_time check (status = 'draft' or sent_at is not null)
);

create table public.daily_statuses (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id),
  status_date date not null,
  mood public.mood not null,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (author_id, status_date)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete cascade,
  type public.notification_type not null,
  resource_id uuid not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index discussions_updated_idx on public.discussions(updated_at desc);
create index replies_discussion_idx on public.discussion_replies(discussion_id, created_at);
create index letters_recipient_idx on public.letters(recipient_id, sent_at desc);
create index statuses_date_idx on public.daily_statuses(status_date desc);
create index notifications_unread_idx on public.notifications(recipient_id, read_at, created_at desc);

create or replace function public.is_member(user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.profiles where id = user_id) $$;

create or replace function public.other_member_id(current_id uuid)
returns uuid language sql stable security definer set search_path = public
as $$
  select id from public.profiles
  where id <> current_id and current_id = auth.uid() and public.is_member(current_id)
  order by created_at limit 1
$$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger touch_discussions before update on public.discussions
for each row execute function public.touch_updated_at();
create trigger touch_letters before update on public.letters
for each row execute function public.touch_updated_at();
create trigger touch_daily_statuses before update on public.daily_statuses
for each row execute function public.touch_updated_at();

create or replace function public.touch_discussion_from_reply()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.discussions set updated_at = now() where id = new.discussion_id;
  return new;
end $$;

create trigger touch_discussion_after_reply after insert on public.discussion_replies
for each row execute function public.touch_discussion_from_reply();

create or replace function public.protect_discussion_record()
returns trigger language plpgsql as $$
begin
  if new.author_id is distinct from old.author_id or new.created_at is distinct from old.created_at then
    raise exception 'Record identity cannot be changed';
  end if;
  if old.deleted_at is not null and (
    new.title is distinct from old.title or new.body is distinct from old.body or new.deleted_at is distinct from old.deleted_at
  ) then raise exception 'Deleted content cannot be changed'; end if;
  return new;
end $$;

create trigger protect_discussion before update on public.discussions
for each row execute function public.protect_discussion_record();

create or replace function public.protect_reply_record()
returns trigger language plpgsql as $$
begin
  if new.author_id is distinct from old.author_id or new.discussion_id is distinct from old.discussion_id
    or new.created_at is distinct from old.created_at then raise exception 'Record identity cannot be changed'; end if;
  if old.deleted_at is not null and (
    new.body is distinct from old.body or new.deleted_at is distinct from old.deleted_at
  ) then raise exception 'Deleted content cannot be changed'; end if;
  return new;
end $$;

create trigger protect_reply before update on public.discussion_replies
for each row execute function public.protect_reply_record();

create or replace function public.protect_sent_letter()
returns trigger language plpgsql as $$
begin
  if old.status = 'sent' and (
    new.title is distinct from old.title or new.body is distinct from old.body or
    new.sender_id is distinct from old.sender_id or new.recipient_id is distinct from old.recipient_id or
    new.status is distinct from old.status or new.sent_at is distinct from old.sent_at
  ) then raise exception 'Sent letters cannot be changed'; end if;
  if old.status = 'draft' and new.status = 'sent' then new.sent_at = now(); end if;
  return new;
end $$;

create trigger protect_sent_letter before update on public.letters
for each row execute function public.protect_sent_letter();

create or replace function public.protect_notification_identity()
returns trigger language plpgsql as $$
begin
  if new.recipient_id is distinct from old.recipient_id or new.actor_id is distinct from old.actor_id
    or new.type is distinct from old.type or new.resource_id is distinct from old.resource_id
    or new.created_at is distinct from old.created_at then
    raise exception 'Notification identity cannot be changed';
  end if;
  return new;
end $$;

create trigger protect_notification before update on public.notifications
for each row execute function public.protect_notification_identity();

create or replace function public.notify_partner()
returns trigger language plpgsql security definer set search_path = public as $$
declare target uuid; resource uuid; kind public.notification_type;
begin
  if tg_table_name = 'letters' then
    if new.status <> 'sent' or (tg_op = 'UPDATE' and old.status = 'sent') then return new; end if;
    target := new.recipient_id; resource := new.id; kind := 'letter';
  elsif tg_table_name = 'discussion_replies' then
    target := public.other_member_id(new.author_id); resource := new.discussion_id; kind := 'reply';
  elsif tg_table_name = 'discussions' then
    target := public.other_member_id(new.author_id); resource := new.id; kind := 'discussion';
  else
    target := public.other_member_id(new.author_id); resource := new.id; kind := 'daily_status';
    delete from public.notifications where recipient_id = target and actor_id = new.author_id
      and type = 'daily_status' and resource_id = new.id;
  end if;
  if target is not null then insert into public.notifications(recipient_id, actor_id, type, resource_id)
    values(target, new.author_id, kind, resource); end if;
  return new;
end $$;

create trigger notify_discussion after insert on public.discussions for each row execute function public.notify_partner();
create trigger notify_reply after insert on public.discussion_replies for each row execute function public.notify_partner();
create trigger notify_letter after insert or update on public.letters for each row execute function public.notify_partner();
create trigger notify_status after insert or update on public.daily_statuses for each row execute function public.notify_partner();

alter table public.profiles enable row level security;
alter table public.discussions enable row level security;
alter table public.discussion_replies enable row level security;
alter table public.letters enable row level security;
alter table public.daily_statuses enable row level security;
alter table public.notifications enable row level security;

create policy "members read profiles" on public.profiles for select using (public.is_member());
create policy "members read discussions" on public.discussions for select using (public.is_member());
create policy "members create discussions" on public.discussions for insert with check (public.is_member() and author_id = auth.uid());
create policy "authors update discussions" on public.discussions for update using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy "members read replies" on public.discussion_replies for select using (public.is_member());
create policy "members create replies" on public.discussion_replies for insert with check (
  public.is_member() and author_id = auth.uid() and exists (
    select 1 from public.discussions where id = discussion_id and status = 'open' and deleted_at is null
  )
);
create policy "authors update replies" on public.discussion_replies for update using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy "participants read letters" on public.letters for select using (
  public.is_member() and (sender_id = auth.uid() or (recipient_id = auth.uid() and status = 'sent'))
);
create policy "senders create letters" on public.letters for insert with check (
  public.is_member() and sender_id = auth.uid() and recipient_id = public.other_member_id(auth.uid())
);
create policy "senders update drafts or recipients read" on public.letters for update using (
  (sender_id = auth.uid() and status = 'draft') or (recipient_id = auth.uid() and status = 'sent')
) with check (
  sender_id = auth.uid() or (recipient_id = auth.uid() and status = 'sent')
);
create policy "members read statuses" on public.daily_statuses for select using (public.is_member());
create policy "authors create statuses" on public.daily_statuses for insert with check (
  public.is_member() and author_id = auth.uid() and status_date = (now() at time zone 'Asia/Shanghai')::date
);
create policy "authors update statuses" on public.daily_statuses for update using (
  author_id = auth.uid() and status_date = (now() at time zone 'Asia/Shanghai')::date
) with check (author_id = auth.uid() and status_date = (now() at time zone 'Asia/Shanghai')::date);
create policy "recipients read notifications" on public.notifications for select using (recipient_id = auth.uid());
create policy "recipients update notifications" on public.notifications for update using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());

revoke all on function public.other_member_id(uuid) from public;
grant execute on function public.other_member_id(uuid) to authenticated;
