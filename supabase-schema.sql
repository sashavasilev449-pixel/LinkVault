-- LinkVault: схема базы данных. Выполнить целиком в Supabase → SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  email_confirmed_at timestamptz
);

create table if not exists public.linkvault_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  url text not null check (char_length(url) <= 2048),
  description text not null default '' check (char_length(description) <= 220),
  category text not null default 'Другое' check (char_length(category) <= 24),
  favorite boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists linkvault_links_user_created_idx on public.linkvault_links(user_id, created_at desc);

create table if not exists public.user_categories (
  user_id uuid primary key references auth.users(id) on delete cascade,
  categories text[] not null default array['Обучение','Работа','Игры','Развлечения','Инструменты','Другое']::text[]
);

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, email_confirmed_at) values (new.id, new.email_confirmed_at)
  on conflict (id) do update set email_confirmed_at = excluded.email_confirmed_at;
  insert into public.user_categories(user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_linkvault on auth.users;
create trigger on_auth_user_created_linkvault after insert or update on auth.users
for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.linkvault_links enable row level security;
alter table public.user_categories enable row level security;
alter table public.admin_users enable row level security;

drop policy if exists "Users read own profile" on public.profiles;
create policy "Users read own profile" on public.profiles for select to authenticated using (id = (select auth.uid()));
drop policy if exists "Users read own links" on public.linkvault_links;
create policy "Users read own links" on public.linkvault_links for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "Users add own links" on public.linkvault_links;
create policy "Users add own links" on public.linkvault_links for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "Users update own links" on public.linkvault_links;
create policy "Users update own links" on public.linkvault_links for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "Users delete own links" on public.linkvault_links;
create policy "Users delete own links" on public.linkvault_links for delete to authenticated using (user_id = (select auth.uid()));
drop policy if exists "Users read own categories" on public.user_categories;
create policy "Users read own categories" on public.user_categories for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "Users insert own categories" on public.user_categories;
create policy "Users insert own categories" on public.user_categories for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "Users update own categories" on public.user_categories;
create policy "Users update own categories" on public.user_categories for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
-- Клиенты не могут читать/изменять список администраторов.

create or replace function public.is_linkvault_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admin_users where user_id = (select auth.uid()));
$$;
revoke all on function public.is_linkvault_admin() from public;
grant execute on function public.is_linkvault_admin() to authenticated;

create or replace function public.linkvault_admin_stats()
returns json language plpgsql security definer set search_path = '' as $$
declare result json;
begin
  if not public.is_linkvault_admin() then raise exception 'Доступ запрещён'; end if;
  select json_build_object(
    'users_total', (select count(*) from public.profiles),
    'users_verified', (select count(*) from public.profiles where email_confirmed_at is not null),
    'users_last_7_days', (select count(*) from public.profiles where created_at >= now() - interval '7 days'),
    'links_total', (select count(*) from public.linkvault_links)
  ) into result;
  return result;
end;
$$;
revoke all on function public.linkvault_admin_stats() from public;
grant execute on function public.linkvault_admin_stats() to authenticated;

grant select on public.profiles to authenticated;
grant select, insert, update, delete on public.linkvault_links to authenticated;
grant select, insert, update on public.user_categories to authenticated;

-- Создать профили для пользователей, которые существовали до установки триггера.
insert into public.profiles(id, email_confirmed_at)
select id, email_confirmed_at from auth.users
on conflict (id) do update set email_confirmed_at = excluded.email_confirmed_at;
