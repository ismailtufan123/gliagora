-- listmonk's settings, list and API user, kept in the repository (M2, D50) so the server can be
-- rebuilt from deploy/. listmonk stores its settings in its own database (table `settings`, which
-- wins over its environment variables), and reads them and its API users only when it starts.
--
-- Run on listmonk's database after `listmonk --install` and `--upgrade`, in ONE transaction, by:
--   - deploy/listmonk/prepare.sh on the server (psql, as the PostgreSQL superuser), on every
--     update.sh, followed by a restart of listmonk when anything changed;
--   - `pnpm listmonk:setup` (src/scripts/listmonk-setup.ts) locally, and the tests and CI.
-- Plain SQL only (no psql meta-commands), so both run the same file. The runner first creates
--   create temp table gliagora_params (key text primary key, value text not null) on commit drop;
-- in the same transaction and fills it with:
--   api_token_sha256  lowercase hex SHA-256 of LISTMONK_API_TOKEN (the token itself never reaches
--                     SQL; listmonk 6.2 stores API tokens that way)
--   root_url          listmonk's own address: the admin's links, never a public one (the server's
--                     is the SSH tunnel of deploy/README.md, http://localhost:9001)
--   smtp_host, smtp_port, smtp_user, smtp_password, smtp_tls (STARTTLS | TLS | none)
--                     the mailbox's SMTP server, from the app's SMTP_* settings; all empty while
--                     SMTP_HOST is (then listmonk can send nothing)
--   campaigns_token_sha256
--                     lowercase hex SHA-256 of LISTMONK_CAMPAIGNS_TOKEN, the token of the issues'
--                     API user (M11, D53); empty while it is not set (the user is then disabled)
--   mailbox_limit_hour, mailbox_limit_day, email_cap_hour, email_cap_day
--                     the mailbox's sending limits (MAILBOX_LIMIT_*, M2) and the forms' email cap
--                     (EMAIL_CAP_*, D50), as written (empty: not set), from which the issues'
--                     sending rate is derived (step 4)
--
-- Every change is made only where the value differs, so a second run changes nothing; the last
-- statement returns what changed (names only, never a value), which tells the runner whether
-- listmonk needs a restart. What it keeps in step every time (a change made in listmonk's admin to
-- any of these is undone at the next update):
--   - the install's samples are removed (two subscribers, two lists, a campaign; the templates stay);
--   - the private, single opt-in list "Glia Notes": the app adds only confirmed subscribers, after
--     its own double opt-in, so listmonk never holds an unconfirmed address (PLAN §13);
--   - the app's API user `gliagora-app`, which may only find (by ID, or by address with `search`),
--     add, change and delete subscribers of Glia Notes (no settings, no other list, no campaigns,
--     and no SQL queries: see step 3);
--   - the issues' API user `gliagora-campaigns` (M11, D53), which may only read, make and change
--     campaigns of Glia Notes, schedule them and read the templates (no subscriber lists, no
--     settings; see step 3b for what listmonk cannot narrow);
--     and the site's campaign template, which adds nothing to an issue (step 3b);
--   - the settings below: no update check, no public pages of its own (subscription, archive,
--     opt-in), no tracking, no IP addresses, none of its own unsubscribe headers (the app sends its
--     own, RFC 8058), no captcha services, no bounce processing yet (M2, with the mailbox), and the
--     issues' sending rate within the mailbox's limits.
-- Nothing here is ever deleted that the install did not make, and no subscriber of Glia Notes is
-- touched.

-- The parameters, checked before anything changes. Messages name a parameter, never its value.
create temp table gliagora_p on commit drop as
select
  max(value) filter (where key = 'api_token_sha256') as api_token_sha256,
  max(value) filter (where key = 'root_url') as root_url,
  coalesce(max(value) filter (where key = 'smtp_host'), '') as smtp_host,
  coalesce(max(value) filter (where key = 'smtp_port'), '') as smtp_port,
  coalesce(max(value) filter (where key = 'smtp_user'), '') as smtp_user,
  coalesce(max(value) filter (where key = 'smtp_password'), '') as smtp_password,
  coalesce(max(value) filter (where key = 'smtp_tls'), '') as smtp_tls,
  coalesce(max(value) filter (where key = 'campaigns_token_sha256'), '') as campaigns_token_sha256,
  coalesce(max(value) filter (where key = 'mailbox_limit_hour'), '') as mailbox_limit_hour,
  coalesce(max(value) filter (where key = 'mailbox_limit_day'), '') as mailbox_limit_day,
  coalesce(max(value) filter (where key = 'email_cap_hour'), '') as email_cap_hour,
  coalesce(max(value) filter (where key = 'email_cap_day'), '') as email_cap_day
from gliagora_params;

do $$
declare
  p record;
begin
  select * into p from gliagora_p;
  if not exists (select from settings where key = 'migrations') then
    raise exception 'listmonk is not installed in this database (run listmonk --install first)';
  end if;
  -- Role 1 is listmonk's super admin, whatever its permissions say (auth.SuperAdminRoleID): its
  -- install makes it together with the admin account. On an install without an admin, the app's
  -- role below would be made first, as role 1, and its API user could do anything.
  if not exists (select from roles where id = 1 and type = 'user' and parent_id is null)
    or exists (select from roles where id = 1 and name in ('gliagora-app', 'gliagora-app-lists')) then
    raise exception 'listmonk has no admin yet (its role 1): install it with LISTMONK_ADMIN_USER and LISTMONK_ADMIN_PASSWORD, or create the first account in its admin, before these settings';
  end if;
  if coalesce(p.api_token_sha256, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'api_token_sha256 must be the 64 lowercase hex characters of a SHA-256';
  end if;
  if coalesce(p.root_url, '') !~ '^https?://[A-Za-z0-9.:\[\]-]+$' then
    raise exception 'root_url must be http(s)://host[:port], without a path';
  end if;
  if p.smtp_host <> '' then
    if p.smtp_host !~ '^[A-Za-z0-9.:\[\]-]+$' then
      raise exception 'smtp_host is not a host name';
    end if;
    if p.smtp_port !~ '^[0-9]{1,5}$' or p.smtp_port::int not between 1 and 65535 then
      raise exception 'smtp_port is not a port number';
    end if;
    if p.smtp_tls not in ('STARTTLS', 'TLS', 'none') then
      raise exception 'smtp_tls must be STARTTLS, TLS or none';
    end if;
  end if;
  if (select count(*) from lists where name = 'Glia Notes') > 1 then
    raise exception 'more than one list is named Glia Notes: rename the others in listmonk''s admin';
  end if;
  if p.campaigns_token_sha256 <> '' and p.campaigns_token_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'campaigns_token_sha256 must be empty or the 64 lowercase hex characters of a SHA-256';
  end if;
  if p.campaigns_token_sha256 = p.api_token_sha256 then
    raise exception 'campaigns_token_sha256 must differ from api_token_sha256: give the two API users different tokens';
  end if;
  if p.mailbox_limit_hour !~ '^([1-9][0-9]{0,6})?$' or p.mailbox_limit_day !~ '^([1-9][0-9]{0,6})?$' then
    raise exception 'mailbox_limit_hour and mailbox_limit_day must be empty or whole numbers from 1 to 9999999';
  end if;
  -- As the app reads them (src/lib/forms/email-cap.ts): up to six digits, from 1 to 100000.
  if p.email_cap_hour !~ '^([0-9]{1,6})?$' or p.email_cap_day !~ '^([0-9]{1,6})?$'
    or (p.email_cap_hour <> '' and p.email_cap_hour::int not between 1 and 100000)
    or (p.email_cap_day <> '' and p.email_cap_day::int not between 1 and 100000) then
    raise exception 'email_cap_hour and email_cap_day must be empty or whole numbers from 1 to 100000 (the app reads them so too)';
  end if;
end
$$;

-- The issues' sending rate (M11, D53), from the mailbox's limits: of each limit, a tenth stays for
-- the scheduled emails and anything sent by hand, and the forms' cap twice (their links, and as
-- many welcome emails again; EMAIL_CAP_* read as the app reads them, src/lib/forms/email-cap.ts:
-- empty day 200, empty hour 50 or the day if lower, the hour never above the day); the rest is
-- the issues' share. listmonk then sends at most `rate` messages per window of `window_hours`
-- (its sliding window starts with the first message and pauses until the window has passed):
-- the hour's share each hour, or, with a daily limit, a window long enough that the windows of a
-- day stay within the day's share. Without limits, 50 an hour (the app pushes nothing then).
-- src/lib/newsletter/issue/settings.ts computes the same (`sendRate`; a database test compares).
create temp table gliagora_rate on commit drop as
with caps as (
  select coalesce(nullif(p.email_cap_day, '')::int, 200) as cap_day,
    nullif(p.email_cap_hour, '')::int as cap_hour_set,
    nullif(p.mailbox_limit_hour, '')::int as mh,
    nullif(p.mailbox_limit_day, '')::int as md
  from gliagora_p p
),
shares as (
  select floor(mh * 0.9)::int - 2 * least(coalesce(cap_hour_set, least(50, cap_day)), cap_day) as sh,
    floor(md * 0.9)::int - 2 * cap_day as sd
  from caps
)
select sh, sd,
  case when sh is null and sd is null then 50 when sd is null then sh when sh is null then sd
    else least(sh, sd) end as rate,
  case when sd is null then 1 when sh is null then 24
    else ceil(24.0 / floor(sd::numeric / least(sh, sd)))::int end as window_hours
from shares;

do $$
begin
  if exists (select from gliagora_rate where sh < 1 or sd < 1) then
    raise exception 'the mailbox''s sending limit leaves no room for Glia Notes after the forms'' email cap: lower EMAIL_CAP_* or check MAILBOX_LIMIT_*';
  end if;
end
$$;

-- What changed, by name only (returned at the end).
create temp table gliagora_changes (what text not null) on commit drop;

-- 1. The install's samples. The campaign only while it is the untouched draft, the lists only
-- once nobody is on them and no campaign names them.
with gone as (
  delete from campaigns where name = 'Test campaign' and status = 'draft' returning 1
)
insert into gliagora_changes select distinct 'removed the sample campaign' from gone;

with gone as (
  delete from subscribers where email in ('john@example.com', 'anon@example.com') returning 1
)
insert into gliagora_changes select distinct 'removed the sample subscribers' from gone;

with gone as (
  delete from lists l
  where l.name in ('Default list', 'Opt-in list')
    and not exists (select from subscriber_lists s where s.list_id = l.id)
    and not exists (select from campaign_lists c where c.list_id = l.id)
  returning 1
)
insert into gliagora_changes select distinct 'removed the sample lists' from gone;

-- 2. The list.
with made as (
  insert into lists (uuid, name, type, optin, status, tags, description)
  select gen_random_uuid(), 'Glia Notes', 'private', 'single', 'active', '{}',
    'The monthly digest of gliagora.com. Only confirmed subscribers: the site runs the double opt-in.'
  where not exists (select from lists where name = 'Glia Notes')
  returning 1
)
insert into gliagora_changes select 'created the list Glia Notes' from made;

with kept as (
  update lists set type = 'private', optin = 'single', status = 'active', updated_at = now()
  where name = 'Glia Notes'
    and (type, optin, status) is distinct from ('private'::list_type, 'single'::list_optin, 'active'::list_status)
  returning 1
)
insert into gliagora_changes select 'list Glia Notes' from kept;

-- 3. The app's API user, with a user role (what it may do) and a list role (where): subscribers
-- only, and only on Glia Notes. Never `subscribers:sql_query` (the `query` of /api/subscribers):
-- listmonk 6.2 checks such an expression only by the tables its plan names, and a function that
-- runs SQL from a text (query_to_xml, ts_stat) names none, so the expression could read every
-- table of listmonk's database, its admin sessions and the SMTP password included. The app finds
-- a subscriber by its ID (GET /api/subscribers/:id, then compares the UUID) or by its address
-- (`search`); tests/integration/listmonk.db.test.ts checks that `query` is refused.
with r as (
  insert into roles (type, name, permissions)
  values ('user', 'gliagora-app', '{subscribers:get,subscribers:manage}')
  on conflict (type, name) where name is not null do update
    set permissions = excluded.permissions, updated_at = now()
    where roles.permissions is distinct from excluded.permissions
  returning 1
)
insert into gliagora_changes select 'role gliagora-app' from r;

with r as (
  insert into roles (type, name, permissions)
  values ('list', 'gliagora-app-lists', '{}')
  on conflict (type, name) where name is not null do nothing
  returning 1
)
insert into gliagora_changes select 'list role gliagora-app-lists' from r;

-- Its one list: Glia Notes, to read and to add subscribers to and remove them from.
with parent as (
  select id from roles where type = 'list' and name = 'gliagora-app-lists'
),
others as (
  delete from roles
  where parent_id = (select id from parent)
    and list_id is distinct from (select id from lists where name = 'Glia Notes')
  returning 1
)
insert into gliagora_changes select distinct 'list role gliagora-app-lists: other lists' from others;

with r as (
  insert into roles (type, parent_id, list_id, permissions)
  select 'list', parent.id, list.id, '{list:get,list:manage}'
  from roles parent, lists list
  where parent.type = 'list' and parent.name = 'gliagora-app-lists' and list.name = 'Glia Notes'
  on conflict (parent_id, list_id) do update
    set permissions = excluded.permissions, updated_at = now()
    where roles.permissions is distinct from excluded.permissions
  returning 1
)
insert into gliagora_changes select 'list role gliagora-app-lists: Glia Notes' from r;

with wanted as (
  select
    'gliagora-app'::text as username,
    false as password_login,
    p.api_token_sha256 as password,
    'gliagora-app@api'::text as email,
    'gliagora-app'::text as name,
    'api'::user_type as type,
    (select id from roles where type = 'user' and name = 'gliagora-app') as user_role_id,
    (select id from roles where type = 'list' and name = 'gliagora-app-lists') as list_role_id,
    'enabled'::user_status as status
  from gliagora_p p
),
u as (
  insert into users (username, password_login, password, email, name, type, user_role_id,
    list_role_id, status)
  select username, password_login, password, email, name, type, user_role_id, list_role_id, status
  from wanted
  on conflict (username) do update
    set password_login = excluded.password_login, password = excluded.password,
      email = excluded.email, name = excluded.name, type = excluded.type,
      user_role_id = excluded.user_role_id, list_role_id = excluded.list_role_id,
      status = excluded.status, twofa_type = 'none', twofa_key = null, updated_at = now()
    where (users.password_login, users.password, users.email, users.name, users.type,
        users.user_role_id, users.list_role_id, users.status, users.twofa_type)
      is distinct from (excluded.password_login, excluded.password, excluded.email, excluded.name,
        excluded.type, excluded.user_role_id, excluded.list_role_id, excluded.status,
        'none'::twofa_type)
  returning 1
)
insert into gliagora_changes select 'API user gliagora-app' from u;

-- 3b. The issues of Glia Notes (M11, D53).
-- The site's campaign template: nothing but the issue the site rendered (its own layout, footer
-- and unsubscribe links), so listmonk adds no header, footer, unsubscribe link or tracking pixel
-- of its own. Never the default: a campaign made by hand in listmonk's admin keeps listmonk's.
with made as (
  insert into templates (name, type, subject, body, is_default)
  select 'Glia Notes issue (site)', 'campaign', '', '{{ template "content" . }}', false
  where not exists (
    select from templates where name = 'Glia Notes issue (site)' and type = 'campaign')
  returning 1
)
insert into gliagora_changes select 'created the template Glia Notes issue (site)' from made;

with kept as (
  update templates set body = '{{ template "content" . }}', is_default = false, updated_at = now()
  where name = 'Glia Notes issue (site)' and type = 'campaign'
    and (body, is_default) is distinct from ('{{ template "content" . }}', false)
  returning 1
)
insert into gliagora_changes select 'template Glia Notes issue (site)' from kept;

-- The issues' API user, apart from the subscribers' one so that each token can do as little as
-- possible: campaigns of Glia Notes only (read, make, change, schedule) and the templates (read,
-- to find the one above); it may not list, read or change subscribers or settings, never
-- `subscribers:sql_query`. listmonk scopes `campaigns:get` and `campaigns:manage` to the lists of
-- the user's list role, which names Glia Notes with `list:get` (the list, not its subscribers).
-- listmonk 6.2 cannot narrow it further: `campaigns:manage` also allows a campaign's test send to
-- subscribers named by address, and `campaigns:send` starting a draft at once; the app uses
-- neither (an accepted risk, PLAN §20, M11 notes). The app pushes an issue only on an editor's
-- action, and only once GLIA_NOTES_PUSH is on (D53).
with r as (
  insert into roles (type, name, permissions)
  values ('user', 'gliagora-campaigns', '{campaigns:get,campaigns:manage,campaigns:send,templates:get}')
  on conflict (type, name) where name is not null do update
    set permissions = excluded.permissions, updated_at = now()
    where roles.permissions is distinct from excluded.permissions
  returning 1
)
insert into gliagora_changes select 'role gliagora-campaigns' from r;

with r as (
  insert into roles (type, name, permissions)
  values ('list', 'gliagora-campaigns-lists', '{}')
  on conflict (type, name) where name is not null do nothing
  returning 1
)
insert into gliagora_changes select 'list role gliagora-campaigns-lists' from r;

with parent as (
  select id from roles where type = 'list' and name = 'gliagora-campaigns-lists'
),
others as (
  delete from roles
  where parent_id = (select id from parent)
    and list_id is distinct from (select id from lists where name = 'Glia Notes')
  returning 1
)
insert into gliagora_changes select distinct 'list role gliagora-campaigns-lists: other lists' from others;

with r as (
  insert into roles (type, parent_id, list_id, permissions)
  select 'list', parent.id, list.id, '{list:get}'
  from roles parent, lists list
  where parent.type = 'list' and parent.name = 'gliagora-campaigns-lists' and list.name = 'Glia Notes'
  on conflict (parent_id, list_id) do update
    set permissions = excluded.permissions, updated_at = now()
    where roles.permissions is distinct from excluded.permissions
  returning 1
)
insert into gliagora_changes select 'list role gliagora-campaigns-lists: Glia Notes' from r;

-- With a token, the user is made or kept as it should be; without one, an existing user is
-- disabled (its old token then works no more).
with wanted as (
  select
    'gliagora-campaigns'::text as username,
    false as password_login,
    p.campaigns_token_sha256 as password,
    'gliagora-campaigns@api'::text as email,
    'gliagora-campaigns'::text as name,
    'api'::user_type as type,
    (select id from roles where type = 'user' and name = 'gliagora-campaigns') as user_role_id,
    (select id from roles where type = 'list' and name = 'gliagora-campaigns-lists') as list_role_id,
    'enabled'::user_status as status
  from gliagora_p p
  where p.campaigns_token_sha256 <> ''
),
u as (
  insert into users (username, password_login, password, email, name, type, user_role_id,
    list_role_id, status)
  select username, password_login, password, email, name, type, user_role_id, list_role_id, status
  from wanted
  on conflict (username) do update
    set password_login = excluded.password_login, password = excluded.password,
      email = excluded.email, name = excluded.name, type = excluded.type,
      user_role_id = excluded.user_role_id, list_role_id = excluded.list_role_id,
      status = excluded.status, twofa_type = 'none', twofa_key = null, updated_at = now()
    where (users.password_login, users.password, users.email, users.name, users.type,
        users.user_role_id, users.list_role_id, users.status, users.twofa_type)
      is distinct from (excluded.password_login, excluded.password, excluded.email, excluded.name,
        excluded.type, excluded.user_role_id, excluded.list_role_id, excluded.status,
        'none'::twofa_type)
  returning 1
)
insert into gliagora_changes select 'API user gliagora-campaigns' from u;

with off as (
  update users set status = 'disabled', updated_at = now()
  where username = 'gliagora-campaigns' and status <> 'disabled'
    and (select campaigns_token_sha256 from gliagora_p) = ''
  returning 1
)
insert into gliagora_changes select 'API user gliagora-campaigns: disabled' from off;

-- 4. The settings. Each key must exist (a listmonk upgrade that renamed one must not leave the old
-- value silently in force).
create temp table gliagora_settings (key text primary key, value jsonb not null) on commit drop;

insert into gliagora_settings (key, value) values
  ('app.site_name', '"Glia Notes"'),
  ('app.from_email', '"Glia Notes <digest@gliagora.com>"'),
  ('app.lang', '"en"'),
  ('app.check_updates', 'false'),
  ('app.enable_public_subscription_page', 'false'),
  ('app.enable_public_archive', 'false'),
  ('app.enable_public_archive_rss_content', 'false'),
  ('app.send_optin_confirmation', 'false'),
  ('app.show_optin_page', 'false'),
  ('privacy.individual_tracking', 'false'),
  ('privacy.disable_tracking', 'true'),
  ('privacy.record_optin_ip', 'false'),
  ('privacy.unsubscribe_header', 'false'),
  ('privacy.allow_blocklist', 'false'),
  ('privacy.allow_export', 'false'),
  ('privacy.allow_preferences', 'false'),
  ('privacy.allow_wipe', 'false'),
  ('bounce.enabled', 'false'),
  ('bounce.webhooks_enabled', 'false'),
  -- The issues' sending (M11): one message a second from one worker, paused after 25 errors, and
  -- the sliding window of the issues' sending rate (gliagora_rate, above).
  ('app.concurrency', '1'),
  ('app.message_rate', '1'),
  ('app.max_send_errors', '25'),
  ('app.message_sliding_window', 'true');

insert into gliagora_settings (key, value)
select 'app.message_sliding_window_duration', to_jsonb(r.window_hours || 'h') from gliagora_rate r
union all
select 'app.message_sliding_window_rate', to_jsonb(r.rate) from gliagora_rate r;

insert into gliagora_settings (key, value)
select 'app.root_url', to_jsonb(p.root_url) from gliagora_p p;

-- Both captcha services off, the rest of the value as listmonk has it.
insert into gliagora_settings (key, value)
select 'security.captcha',
  jsonb_set(jsonb_set(s.value, '{altcha,enabled}', 'false'), '{hcaptcha,enabled}', 'false')
from settings s where s.key = 'security.captcha';

-- One SMTP server: the mailbox's, switched on only when SMTP_HOST is set. Without it, a disabled
-- placeholder without credentials. Keys listmonk's admin adds to the entry (its name, a UUID)
-- are kept.
insert into gliagora_settings (key, value)
select 'smtp', jsonb_build_array(
  coalesce((select s.value -> 0 from settings s where s.key = 'smtp' and jsonb_typeof(s.value -> 0) = 'object'), '{}'::jsonb)
  || jsonb_build_object(
    'enabled', p.smtp_host <> '',
    'host', case when p.smtp_host <> '' then p.smtp_host else 'smtp.invalid' end,
    'port', case when p.smtp_host <> '' then p.smtp_port::int else 587 end,
    'auth_protocol', case when p.smtp_host <> '' and p.smtp_user <> '' then 'plain' else 'none' end,
    'username', case when p.smtp_host <> '' then p.smtp_user else '' end,
    'password', case when p.smtp_host <> '' and p.smtp_user <> '' then p.smtp_password else '' end,
    'tls_type', case when p.smtp_host <> '' then p.smtp_tls else 'STARTTLS' end,
    'tls_skip_verify', false,
    'hello_hostname', '',
    'max_conns', 2,
    'idle_timeout', '15s',
    'wait_timeout', '5s',
    'max_msg_retries', 2,
    'msg_retry_delay', '10ms',
    'email_headers', '[]'::jsonb,
    'from_addresses', '[]'::jsonb
  ))
from gliagora_p p;

do $$
declare
  missing text;
begin
  select string_agg(w.key, ', ' order by w.key) into missing
  from gliagora_settings w
  where not exists (select from settings s where s.key = w.key);
  if missing is not null then
    raise exception 'listmonk has no setting %: check deploy/listmonk/settings.sql against this listmonk version', missing;
  end if;
end
$$;

with changed as (
  update settings s set value = w.value, updated_at = now()
  from gliagora_settings w
  where s.key = w.key and s.value is distinct from w.value
  returning s.key
)
insert into gliagora_changes select 'setting ' || key from changed;

-- What changed, by name, separated by "; " (empty: nothing).
select coalesce(string_agg(what, '; ' order by what), '') as changed from gliagora_changes;
