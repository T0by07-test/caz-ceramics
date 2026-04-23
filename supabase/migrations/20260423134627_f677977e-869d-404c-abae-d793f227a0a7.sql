
-- ============ ENABLE EXTENSIONS ============
create extension if not exists pgcrypto;

-- ============ TABLES ============

-- profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'student' check (role in ('student','admin')),
  name text,
  surname text,
  email text unique,
  whatsapp text,
  notification_preference text not null default 'both' check (notification_preference in ('both','email_only','whatsapp_only')),
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- plans
create table public.plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  classes_per_month int not null,
  price_cents int not null default 0,
  stripe_price_id text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.plans enable row level security;

-- subscriptions
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  plan_id uuid not null references public.plans(id),
  month date not null,
  credits_total int not null,
  credits_remaining int not null,
  created_at timestamptz not null default now(),
  unique (student_id, month)
);
alter table public.subscriptions enable row level security;

-- classes
create table public.classes (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  start_time time not null,
  end_time time not null,
  capacity_ideal int not null default 6,
  capacity_max int not null default 7,
  status text not null default 'scheduled' check (status in ('scheduled','auto_cancelled','cancelled_by_admin')),
  created_at timestamptz not null default now()
);
alter table public.classes enable row level security;

-- bookings
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  source text not null check (source in ('plan','drop_in')),
  status text not null default 'reserved' check (status in ('reserved','confirmed','attended','cancelled_recoverable','cancelled_lost')),
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  unique (student_id, class_id)
);
alter table public.bookings enable row level security;

-- payments
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete set null,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  stripe_session_id text unique,
  amount_cents int not null,
  status text not null default 'pending' check (status in ('pending','confirmed','failed')),
  created_at timestamptz not null default now()
);
alter table public.payments enable row level security;

-- makeups
create table public.makeups (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  source_booking_id uuid not null references public.bookings(id) on delete cascade,
  used_booking_id uuid references public.bookings(id) on delete set null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
alter table public.makeups enable row level security;

-- waitlist
create table public.waitlist (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  position int not null,
  created_at timestamptz not null default now(),
  unique (class_id, student_id)
);
alter table public.waitlist enable row level security;

-- notifications
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  channel text not null check (channel in ('email','whatsapp')),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued','sent','failed')),
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.notifications enable row level security;

-- ============ HELPERS ============

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, name, surname, whatsapp)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', ''),
    coalesce(new.raw_user_meta_data->>'surname', ''),
    coalesce(new.raw_user_meta_data->>'whatsapp', '')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============ RLS POLICIES ============

-- profiles
create policy "profiles_select_own" on public.profiles for select using (id = auth.uid());
create policy "profiles_update_own" on public.profiles for update using (id = auth.uid());
create policy "profiles_admin_all"  on public.profiles for all using (public.is_admin()) with check (public.is_admin());

-- plans
create policy "plans_select_active" on public.plans for select to authenticated using (active = true or public.is_admin());
create policy "plans_admin_all"     on public.plans for all using (public.is_admin()) with check (public.is_admin());

-- subscriptions
create policy "subs_select_own" on public.subscriptions for select using (student_id = auth.uid());
create policy "subs_insert_own" on public.subscriptions for insert with check (student_id = auth.uid());
create policy "subs_admin_all"  on public.subscriptions for all using (public.is_admin()) with check (public.is_admin());

-- classes
create policy "classes_select_scheduled" on public.classes for select to authenticated using (status = 'scheduled' or public.is_admin());
create policy "classes_admin_all"        on public.classes for all using (public.is_admin()) with check (public.is_admin());

-- bookings
create policy "bookings_select_own" on public.bookings for select using (student_id = auth.uid());
create policy "bookings_insert_own" on public.bookings for insert with check (student_id = auth.uid());
create policy "bookings_admin_all"  on public.bookings for all using (public.is_admin()) with check (public.is_admin());

-- payments
create policy "payments_select_own" on public.payments for select using (student_id = auth.uid());
create policy "payments_insert_own" on public.payments for insert with check (student_id = auth.uid());
create policy "payments_admin_all"  on public.payments for all using (public.is_admin()) with check (public.is_admin());

-- makeups
create policy "makeups_select_own" on public.makeups for select using (student_id = auth.uid());
create policy "makeups_insert_own" on public.makeups for insert with check (student_id = auth.uid());
create policy "makeups_admin_all"  on public.makeups for all using (public.is_admin()) with check (public.is_admin());

-- waitlist
create policy "waitlist_select_own" on public.waitlist for select using (student_id = auth.uid());
create policy "waitlist_insert_own" on public.waitlist for insert with check (student_id = auth.uid());
create policy "waitlist_admin_all"  on public.waitlist for all using (public.is_admin()) with check (public.is_admin());

-- notifications (no insert/update for users; only service role bypasses RLS)
create policy "notifications_select_own" on public.notifications for select using (student_id = auth.uid());
create policy "notifications_admin_all"  on public.notifications for all using (public.is_admin()) with check (public.is_admin());

-- ============ SEED DATA ============
insert into public.plans (name, classes_per_month, price_cents, stripe_price_id, active) values
  ('1 clase',  1, 0, '', true),
  ('2 clases', 2, 0, '', true),
  ('3 clases', 3, 0, '', true),
  ('4 clases', 4, 0, '', true);
