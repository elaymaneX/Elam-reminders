-- Run this in the Supabase SQL editor (Project -> SQL Editor -> New query) once,
-- after creating your Supabase project.

create table if not exists reminders (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  notes text,
  due_at timestamptz,               -- null = no specific time, just a list item
  done boolean not null default false,
  created_by text not null default 'user',   -- 'user' or 'claude'
  notified boolean not null default false,   -- whether a push has already been sent for this due_at
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

-- Keep updated_at fresh on edits
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists reminders_set_updated_at on reminders;
create trigger reminders_set_updated_at
before update on reminders
for each row execute procedure set_updated_at();

-- Row Level Security: locked down. All access goes through the Next.js API routes
-- using the service role key (server-side only), never the anon key directly, so
-- we simply deny all client-side access at the database level.
alter table reminders enable row level security;
alter table push_subscriptions enable row level security;
-- (No policies added on purpose -> anon/authenticated roles get zero access.
--  Only the service role, used by the server, bypasses RLS.)
