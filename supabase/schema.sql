-- Chạy trong Supabase → SQL Editor (1 lần)
-- Bảng lưu snapshot sổ tài sản theo từng user

create table if not exists public.snapshots (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.snapshots enable row level security;

grant usage on schema public to postgres, anon, authenticated, service_role;
grant all on table public.snapshots to postgres, authenticated, service_role, anon;

drop policy if exists "snapshots_select_own" on public.snapshots;
drop policy if exists "snapshots_insert_own" on public.snapshots;
drop policy if exists "snapshots_update_own" on public.snapshots;
drop policy if exists "snapshots_delete_own" on public.snapshots;

create policy "snapshots_select_own"
  on public.snapshots for select
  using (auth.uid() = user_id);

create policy "snapshots_insert_own"
  on public.snapshots for insert
  with check (auth.uid() = user_id);

create policy "snapshots_update_own"
  on public.snapshots for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "snapshots_delete_own"
  on public.snapshots for delete
  using (auth.uid() = user_id);

-- Tự xác nhận email khi đăng ký (app cá nhân, 1 user)
create or replace function public.auto_confirm_user()
returns trigger
language plpgsql
security definer
set search_path = auth, public
as $$
begin
  new.email_confirmed_at = coalesce(new.email_confirmed_at, now());
  return new;
end;
$$;

drop trigger if exists on_auth_user_auto_confirm on auth.users;
create trigger on_auth_user_auto_confirm
  before insert on auth.users
  for each row
  execute function public.auto_confirm_user();
