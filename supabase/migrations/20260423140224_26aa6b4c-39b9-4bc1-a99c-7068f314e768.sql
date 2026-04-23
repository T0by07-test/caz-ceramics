
-- =========================================================================
-- book_class: atomic booking with capacity, plan-credit, idempotency checks
-- =========================================================================
create or replace function public.book_class(
  p_class_id uuid,
  p_source text
)
returns table (booking_id uuid, status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student uuid := auth.uid();
  v_class record;
  v_existing record;
  v_count int;
  v_subscription record;
  v_month date;
  v_new_status text;
  v_new_id uuid;
begin
  if v_student is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  if p_source not in ('plan','drop_in') then
    raise exception 'INVALID_SOURCE' using errcode = '22023';
  end if;

  -- Lock the class row to serialise concurrent capacity checks for the same class.
  select id, date, start_time, status, capacity_max
    into v_class
    from public.classes
    where id = p_class_id
    for update;

  if not found then
    raise exception 'CLASS_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_class.status <> 'scheduled' then
    raise exception 'CLASS_NOT_SCHEDULED' using errcode = '22023';
  end if;

  -- Idempotency: if an active (non-cancelled) booking already exists for this
  -- (student, class), return it.
  select id, status
    into v_existing
    from public.bookings
    where class_id = p_class_id
      and student_id = v_student
      and status in ('reserved','confirmed','attended')
    limit 1;

  if found then
    booking_id := v_existing.id;
    status := v_existing.status;
    return next;
    return;
  end if;

  -- Capacity check (only counts active bookings).
  select count(*) into v_count
    from public.bookings
    where class_id = p_class_id
      and status in ('reserved','confirmed','attended');

  if v_count >= v_class.capacity_max then
    raise exception 'CLASS_FULL' using errcode = '22023';
  end if;

  if p_source = 'plan' then
    v_month := date_trunc('month', v_class.date)::date;

    select id, credits_remaining
      into v_subscription
      from public.subscriptions
      where student_id = v_student
        and month = v_month
      for update;

    if not found then
      raise exception 'NO_PLAN_THIS_MONTH' using errcode = '22023';
    end if;

    if v_subscription.credits_remaining <= 0 then
      raise exception 'NO_CREDITS_REMAINING' using errcode = '22023';
    end if;

    update public.subscriptions
       set credits_remaining = credits_remaining - 1
     where id = v_subscription.id;

    v_new_status := 'confirmed';
  else
    v_new_status := 'reserved';
  end if;

  insert into public.bookings (student_id, class_id, source, status)
    values (v_student, p_class_id, p_source, v_new_status)
    returning id into v_new_id;

  if p_source = 'drop_in' then
    -- Stripe wired in Phase 5; for now record a pending payment placeholder.
    insert into public.payments (student_id, booking_id, amount_cents, status)
      values (v_student, v_new_id, 0, 'pending');
  end if;

  booking_id := v_new_id;
  status := v_new_status;
  return next;
end;
$$;

revoke all on function public.book_class(uuid, text) from public;
grant execute on function public.book_class(uuid, text) to authenticated;

-- =========================================================================
-- cancel_booking: 3h rule + makeup creation, idempotent
-- =========================================================================
create or replace function public.cancel_booking(
  p_booking_id uuid
)
returns table (booking_id uuid, status text, makeup_id uuid)
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

  -- Idempotency: if already cancelled, return current state.
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

  select date, start_time
    into v_class
    from public.classes
    where id = v_booking.class_id;

  if not found then
    raise exception 'CLASS_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- Treat the class start as Europe/Madrid wall-clock time.
  v_start_madrid := ((v_class.date::text || ' ' || v_class.start_time::text)::timestamp)
                    at time zone 'Europe/Madrid';

  v_recoverable := v_now < (v_start_madrid - interval '3 hours');
  v_new_status := case when v_recoverable then 'cancelled_recoverable' else 'cancelled_lost' end;

  update public.bookings
     set status = v_new_status,
         cancelled_at = v_now
   where id = v_booking.id;

  if v_recoverable then
    -- Expires at the last day of the class's month, 23:59 Europe/Madrid.
    v_expires_at := ((date_trunc('month', v_class.date) + interval '1 month' - interval '1 day')::date::text
                     || ' 23:59:00')::timestamp at time zone 'Europe/Madrid';

    insert into public.makeups (student_id, source_booking_id, expires_at)
      values (v_student, v_booking.id, v_expires_at)
      returning id into v_makeup;
  end if;

  booking_id := v_booking.id;
  status := v_new_status;
  makeup_id := v_makeup;
  return next;
end;
$$;

revoke all on function public.cancel_booking(uuid) from public;
grant execute on function public.cancel_booking(uuid) to authenticated;
