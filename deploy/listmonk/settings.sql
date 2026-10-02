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
--   - the settings below: no update check, no public pages of its own (subscription, archive,
--     opt-in), no tracking, no IP addresses, none of its own unsubscribe headers (the app sends its
--     own, RFC 8058), no captcha services, no bounce processing yet (M2, with the mailbox).
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
  coalesce(max(value) filter (where key = 'smtp_tls'), '') as smtp_tls
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
  ('bounce.webhooks_enabled', 'false');

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
