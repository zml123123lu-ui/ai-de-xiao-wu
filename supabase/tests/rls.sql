-- Run against a disposable local Supabase database after applying migrations.
-- The assertions document the required access-control contract.
begin;
select plan(5);

select policies_are('public', 'profiles', array['members read profiles']);
select policies_are('public', 'discussions', array['members read discussions', 'members create discussions', 'authors update discussions']);
select policies_are('public', 'letters', array['participants read letters', 'senders create letters', 'senders update drafts or recipients read']);
select policies_are('public', 'daily_statuses', array['members read statuses', 'authors create statuses', 'authors update statuses']);
select policies_are('public', 'notifications', array['recipients read notifications', 'recipients update notifications']);

select * from finish();
rollback;
