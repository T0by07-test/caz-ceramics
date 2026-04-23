create policy "waitlist_delete_own"
on public.waitlist
for delete
to public
using (student_id = auth.uid());

create or replace function public.join_waitlist(p_class_id uuid)
returns table(waitlist_id uuid, pos int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student uuid := auth.uid();
  v_class record;
  v_existing record;
  v_active_booking int;
  v_next_pos int;
  v_new_id uuid;
begin
  if v_student is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  select id, status into v_class from public.classes where id = p_class_id for update;
  if not found then
    raise exception 'CLASS_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_class.status <> 'scheduled' then
    raise exception 'CLASS_NOT_SCHEDULED' using errcode = '22023';
  end if;

  select count(*) into v_active_booking
    from public.bookings
    where class_id = p_class_id
      and student_id = v_student
      and status in ('reserved','confirmed','attended');
  if v_active_booking > 0 then
    raise exception 'ALREADY_BOOKED' using errcode = '22023';
  end if;

  select id, position into v_existing
    from public.waitlist
    where class_id = p_class_id and student_id = v_student
    limit 1;
  if found then
    waitlist_id := v_existing.id;
    pos := v_existing.position;
    return next;
    return;
  end if;

  select coalesce(max(position), 0) + 1 into v_next_pos
    from public.waitlist
    where class_id = p_class_id;

  insert into public.waitlist (class_id, student_id, position)
    values (p_class_id, v_student, v_next_pos)
    returning id into v_new_id;

  waitlist_id := v_new_id;
  pos := v_next_pos;
  return next;
end;
$$;

create or replace function public.promote_waitlist(p_class_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_class record;
  v_count int;
  v_entry record;
  v_subscription record;
  v_month date;
  v_status text;
  v_source text;
  v_booking_id uuid;
begin
  select id, date, status, capacity_max into v_class
    from public.classes
    where id = p_class_id
    for update;
  if not found or v_class.status <> 'scheduled' then
    return;
  end if;

  select count(*) into v_count
    from public.bookings
    where class_id = p_class_id
      and status in ('reserved','confirmed','attended');
  if v_count >= v_class.capacity_max then
    return;
  end if;

  select id, student_id, position into v_entry
    from public.waitlist
    where class_id = p_class_id
    order by position asc
    limit 1
    for update;
  if not found then
    return;
  end if;

  v_month := date_trunc('month', v_class.date)::date;
  select id, credits_remaining into v_subscription
    from public.subscriptions
    where student_id = v_entry.student_id
      and month = v_month
    for update;

  if found and v_subscription.credits_remaining > 0 then
    update public.subscriptions
      set credits_remaining = credits_remaining - 1
      where id = v_subscription.id;
    v_status := 'confirmed';
    v_source := 'plan';
  else
    v_status := 'reserved';
    v_source := 'drop_in';
  end if;

  insert into public.bookings (student_id, class_id, source, status)
    values (v_entry.student_id, p_class_id, v_source, v_status)
    returning id into v_booking_id;

  if v_source = 'drop_in' then
    insert into public.payments (student_id, booking_id, amount_cents, status)
      values (v_entry.student_id, v_booking_id, 0, 'pending');
  end if;

  delete from public.waitlist where id = v_entry.id;

  insert into public.notifications (student_id, type, channel, payload, status)
    values (
      v_entry.student_id,
      'waitlist_promoted',
      'email',
      jsonb_build_object(
        'class_id', p_class_id,
        'booking_id', v_booking_id,
        'requires_payment', (v_source = 'drop_in')
      ),
      'queued'
    );
end;
$$;

create or replace function public.cancel_booking(p_booking_id uuid)
returns table(booking_id uuid, status text, makeup_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student uuid := auth.uid();
  v_booking record;
  v_class record;
  v_start_madrid timestamptz;
  v_now timestamptz := now();
  v_recoverable boolean;
  v_new_status text;
  v_existing_makeup uuid;
  v_makeup uuid;
  v_expires_at timestamptz;
  v_class_id uuid;
begin
  if v_student is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  select id, student_id, class_id, status
    into v_booking
    from public.bookings
    where id = p_booking_id
    for update;
  if not found then
    raise exception 'BOOKING_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_booking.student_id <> v_student then
    raise exception 'NOT_OWNER' using errcode = '42501';
  end if;

  if v_booking.status in ('cancelled_recoverable','cancelled_lost') then
    select id into v_existing_makeup
      from public.makeups
      where source_booking_id = v_booking.id
      limit 1;
    booking_id := v_booking.id;
    status := v_booking.status;
    makeup_id := v_existing_makeup;
    return next;
    return;
  end if;

  select date, start_time into v_class
    from public.classes
    where id = v_booking.class_id;
  if not found then
    raise exception 'CLASS_NOT_FOUND' using errcode = 'P0002';
  end if;

  v_start_madrid := ((v_class.date::text || ' ' || v_class.start_time::text)::timestamp)
                    at time zone 'Europe/Madrid';
  v_recoverable := v_now < (v_start_madrid - interval '3 hours');
  v_new_status := case when v_recoverable then 'cancelled_recoverable' else 'cancelled_lost' end;

  update public.bookings
     set status = v_new_status,
         cancelled_at = v_now
   where id = v_booking.id;

  if v_recoverable then
    v_expires_at := ((date_trunc('month', v_class.date) + interval '1 month' - interval '1 day')::date::text
                     || ' 23:59:00')::timestamp at time zone 'Europe/Madrid';
    insert into public.makeups (student_id, source_booking_id, expires_at)
      values (v_student, v_booking.id, v_expires_at)
      returning id into v_makeup;
  end if;

  v_class_id := v_booking.class_id;
  perform public.promote_waitlist(v_class_id);

  booking_id := v_booking.id;
  status := v_new_status;
  makeup_id := v_makeup;
  return next;
end;
$$;

create or replace function public.auto_cancel_low_attendance()
returns table(cancelled_class_id uuid, affected_bookings int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_class record;
  v_count int;
  v_now timestamptz := now();
  v_start_madrid timestamptz;
  v_expires_at timestamptz;
  v_affected int;
begin
  for v_class in
    select id, date, start_time
      from public.classes
      where status = 'scheduled'
  loop
    v_start_madrid := ((v_class.date::text || ' ' || v_class.start_time::text)::timestamp)
                      at time zone 'Europe/Madrid';
    if v_start_madrid < v_now or v_start_madrid > v_now + interval '24 hours' then
      continue;
    end if;

    select count(*) into v_count
      from public.bookings
      where class_id = v_class.id
        and status in ('reserved','confirmed','attended');
    if v_count >= 3 then
      continue;
    end if;

    update public.classes set status = 'auto_cancelled' where id = v_class.id;

    v_expires_at := ((date_trunc('month', v_class.date) + interval '1 month' - interval '1 day')::date::text
                     || ' 23:59:00')::timestamp at time zone 'Europe/Madrid';

    with affected as (
      update public.bookings
         set status = 'cancelled_recoverable',
             cancelled_at = v_now
       where class_id = v_class.id
         and status in ('reserved','confirmed','attended')
       returning id, student_id
    ),
    inserted_makeups as (
      insert into public.makeups (student_id, source_booking_id, expires_at)
      select student_id, id, v_expires_at from affected
      returning student_id
    ),
    inserted_notifs as (
      insert into public.notifications (student_id, type, channel, payload, status)
      select
        student_id,
        'class_cancelled',
        'email',
        jsonb_build_object('class_id', v_class.id, 'reason', 'low_attendance'),
        'queued'
      from inserted_makeups
      returning 1
    )
    select count(*) into v_affected from affected;

    cancelled_class_id := v_class.id;
    affected_bookings := v_affected;
    return next;
  end loop;
end;
$$;

grant execute on function public.auto_cancel_low_attendance() to anon, authenticated, service_role;
grant execute on function public.join_waitlist(uuid) to authenticated;
grant execute on function public.promote_waitlist(uuid) to authenticated, service_role;