-- Chạy trong Supabase → SQL Editor (1 lần)
-- Bảng lưu snapshot sổ tài sản theo từng user

create table if not exists public.snapshots (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.snapshots enable row level security;

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

-- Auth: tắt "Confirm email" nếu chỉ dùng 1 mình
-- Authentication → Providers → Email → Confirm email = OFF
