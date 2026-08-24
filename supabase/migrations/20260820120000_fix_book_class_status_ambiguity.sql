-- Fix: book_class's RETURNS TABLE(booking_id uuid, status text) makes "status" an
-- implicit OUT variable, which shadows the "status" column on classes/bookings and
-- makes every bare "status" reference in the function body ambiguous.
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

  select c.id, c.date, c.start_time, c.status, c.capacity_max
    into v_class
    from public.classes c
    where c.id = p_class_id
    for update;

  if not found then
    raise exception 'CLASS_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_class.status <> 'scheduled' then
    raise exception 'CLASS_NOT_SCHEDULED' using errcode = '22023';
  end if;

  select b.id, b.status
    into v_existing
    from public.bookings b
    where b.class_id = p_class_id
      and b.student_id = v_student
      and b.status in ('reserved','confirmed','attended')
    limit 1;

  if found then
    booking_id := v_existing.id;
    status := v_existing.status;
    return next;
    return;
  end if;

  select count(*) into v_count
    from public.bookings b
    where b.class_id = p_class_id
      and b.status in ('reserved','confirmed','attended');

  if v_count >= v_class.capacity_max then
    raise exception 'CLASS_FULL' using errcode = '22023';
  end if;

  if p_source = 'plan' then
    v_month := date_trunc('month', v_class.date)::date;

    select exists (
      select 1 from public.subscriptions s
       where s.student_id = v_student and s.month = v_month
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
