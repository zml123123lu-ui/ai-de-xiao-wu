create or replace function public.notify_partner()
returns trigger language plpgsql security definer set search_path = public as $$
declare target uuid; resource uuid; actor uuid; kind public.notification_type;
begin
  if tg_table_name = 'letters' then
    if new.status <> 'sent' or (tg_op = 'UPDATE' and old.status = 'sent') then return new; end if;
    target := new.recipient_id;
    resource := new.id;
    actor := new.sender_id;
    kind := 'letter';
  elsif tg_table_name = 'discussion_replies' then
    target := public.other_member_id(new.author_id);
    resource := new.discussion_id;
    actor := new.author_id;
    kind := 'reply';
  elsif tg_table_name = 'discussions' then
    target := public.other_member_id(new.author_id);
    resource := new.id;
    actor := new.author_id;
    kind := 'discussion';
  else
    target := public.other_member_id(new.author_id);
    resource := new.id;
    actor := new.author_id;
    kind := 'daily_status';
    delete from public.notifications
      where recipient_id = target and actor_id = new.author_id
        and type = 'daily_status' and resource_id = new.id;
  end if;

  if target is not null then
    insert into public.notifications(recipient_id, actor_id, type, resource_id)
    values(target, actor, kind, resource);
  end if;
  return new;
end $$;
