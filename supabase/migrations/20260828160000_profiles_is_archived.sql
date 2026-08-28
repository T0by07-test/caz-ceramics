alter table public.profiles
  add column if not exists is_archived boolean not null default false;

comment on column public.profiles.is_archived is
  'Hides test/duplicate/inactive accounts from the default Miembros list without deleting data.';
