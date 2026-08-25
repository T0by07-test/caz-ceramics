CREATE OR REPLACE FUNCTION public.cancel_booking(p_booking_id uuid)
 RETURNS TABLE(booking_id uuid, status text, makeup_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  select b.id, b.student_id, b.class_id, b.status
    into v_booking
    from public.bookings b
    where b.id = p_booking_id
    for update;
  if not found then
    raise exception 'BOOKING_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_booking.student_id <> v_student then
    raise exception 'NOT_OWNER' using errcode = '42501';
  end if;

  if v_booking.status in ('cancelled_recoverable','cancelled_lost') then
    select m.id into v_existing_makeup
      from public.makeups m
      where m.source_booking_id = v_booking.id
      limit 1;
    booking_id := v_booking.id;
    status := v_booking.status;
    makeup_id := v_existing_makeup;
    return next;
    return;
  end if;

  select c.date, c.start_time into v_class
    from public.classes c
    where c.id = v_booking.class_id;
  if not found then
    raise exception 'CLASS_NOT_FOUND' using errcode = 'P0002';
  end if;

  v_start_madrid := ((v_class.date::text || ' ' || v_class.start_time::text)::timestamp)
                    at time zone 'Europe/Madrid';
  v_recoverable := v_now < (v_start_madrid - interval '12 hours');
  v_new_status := case when v_recoverable then 'cancelled_recoverable' else 'cancelled_lost' end;

  update public.bookings b
     set status = v_new_status,
         cancelled_at = v_now
   where b.id = v_booking.id;

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
$function$;