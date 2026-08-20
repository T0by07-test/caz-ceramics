-- 1. Allow 'makeup' as a booking source.
ALTER TABLE public.bookings DROP CONSTRAINT bookings_source_check;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_source_check
  CHECK (source = ANY (ARRAY['plan'::text, 'drop_in'::text, 'comp'::text, 'makeup'::text]));

-- 2. book_class: no credit accounting. 'plan' only requires an active plan for the month.
CREATE OR REPLACE FUNCTION public.book_class(p_class_id uuid, p_source text)
 RETURNS TABLE(booking_id uuid, status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_student uuid := auth.uid();
  v_class record;
  v_existing record;
  v_count int;
  v_month date;
  v_has_plan boolean;
  v_new_status text;
  v_new_id uuid;
begin
  if v_student is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  if p_source not in ('plan','drop_in') then
    raise exception 'INVALID_SOURCE' using errcode = '22023';
  end if;

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

  select count(*) into v_count
    from public.bookings
    where class_id = p_class_id
      and status in ('reserved','confirmed','attended');

  if v_count >= v_class.capacity_max then
    raise exception 'CLASS_FULL' using errcode = '22023';
  end if;

  if p_source = 'plan' then
    v_month := date_trunc('month', v_class.date)::date;

    select exists (
      select 1 from public.subscriptions
       where student_id = v_student and month = v_month
    ) into v_has_plan;

    if not v_has_plan then
      raise exception 'NO_PLAN_THIS_MONTH' using errcode = '22023';
    end if;

    v_new_status := 'confirmed';
  else
    v_new_status := 'reserved';
  end if;

  insert into public.bookings (student_id, class_id, source, status)
    values (v_student, p_class_id, p_source, v_new_status)
    returning id into v_new_id;

  if p_source = 'drop_in' then
    insert into public.payments (student_id, booking_id, amount_cents, status)
      values (v_student, v_new_id, 0, 'pending');
  end if;

  booking_id := v_new_id;
  status := v_new_status;
  return next;
end;
$function$;

-- 3. promote_waitlist: plan holders get confirmed, others stay pending payment.
CREATE OR REPLACE FUNCTION public.promote_waitlist(p_class_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_class record;
  v_count int;
  v_entry record;
  v_month date;
  v_has_plan boolean;
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
  select exists (
    select 1 from public.subscriptions
     where student_id = v_entry.student_id and month = v_month
  ) into v_has_plan;

  if v_has_plan then
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

  perform public.enqueue_notification(
    v_entry.student_id,
    'waitlist_promoted',
    jsonb_build_object(
      'class_id', p_class_id,
      'booking_id', v_booking_id,
      'requires_payment', (v_source = 'drop_in')
    ),
    v_booking_id::text
  );
end;
$function$;

-- 4. Make-up redemption server-side: consumes the oldest valid makeup, no payment.
CREATE OR REPLACE FUNCTION public.book_makeup(p_class_id uuid)
 RETURNS TABLE(booking_id uuid, makeup_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_student uuid := auth.uid();
  v_class record;
  v_count int;
  v_makeup record;
  v_new_id uuid;
begin
  if v_student is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  select id, status, capacity_max into v_class
    from public.classes where id = p_class_id for update;
  if not found then
    raise exception 'CLASS_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_class.status <> 'scheduled' then
    raise exception 'CLASS_NOT_SCHEDULED' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.bookings
     where class_id = p_class_id and student_id = v_student
       and status in ('reserved','confirmed','attended')
  ) then
    raise exception 'ALREADY_BOOKED' using errcode = '22023';
  end if;

  select count(*) into v_count
    from public.bookings
    where class_id = p_class_id
      and status in ('reserved','confirmed','attended');
  if v_count >= v_class.capacity_max then
    raise exception 'CLASS_FULL' using errcode = '22023';
  end if;

  select id into v_makeup
    from public.makeups
    where student_id = v_student
      and used_booking_id is null
      and expires_at > now()
    order by expires_at asc
    limit 1
    for update;
  if not found then
    raise exception 'NO_MAKEUPS_AVAILABLE' using errcode = '22023';
  end if;

  insert into public.bookings (student_id, class_id, source, status)
    values (v_student, p_class_id, 'makeup', 'confirmed')
    returning id into v_new_id;

  update public.makeups set used_booking_id = v_new_id where id = v_makeup.id;

  booking_id := v_new_id;
  makeup_id := v_makeup.id;
  return next;
end;
$function$;

REVOKE ALL ON FUNCTION public.book_makeup(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.book_makeup(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.book_makeup(uuid) TO service_role;