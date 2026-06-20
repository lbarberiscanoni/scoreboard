-- ===================================================================
--  Personal productivity: calendar time-tracking
--  Run this in the Supabase SQL editor.
--  (The schema is not otherwise version-controlled, so this file is the
--   source of truth for these changes.)
-- ===================================================================

-- 1. New "personal" organization -------------------------------------
insert into organizations (name)
select 'personal'
where not exists (select 1 from organizations where name = 'personal');

-- 1b. A user inside the personal org.
--     events.user_id is a required FK, so calendar rows need an owner.
insert into users (org_id, name, email, role)
select (select id from organizations where name = 'personal'),
       'Lorenzo', 'hllbck7@gmail.com', 'owner'
where not exists (
  select 1
  from users u
  join organizations o on u.org_id = o.id
  where o.name = 'personal'
);

-- 2. New "calendar" input type ---------------------------------------
insert into input_types (name)
select 'calendar'
where not exists (select 1 from input_types where name = 'calendar');

-- 3. Calendar-specific columns on events -----------------------------
--    Nullable -> they stay empty for code / notion / email events.
alter table events add column if not exists end_time timestamptz; -- event end (start lives in `timestamp`)
alter table events add column if not exists title    text;        -- event summary / title
alter table events add column if not exists color    text;        -- calendar color = the categorization key

-- 4. Index for the dashboard's "category over time" query ------------
create index if not exists idx_events_org_input_time
  on events (org_id, input_type_id, timestamp);

-- ===================================================================
--  Handy lookups (Hermes uses these ids when inserting):
--    select id from organizations where name = 'personal';
--    select id from users where org_id = <personal_org_id>;
--    select id from input_types where name = 'calendar';
-- ===================================================================
