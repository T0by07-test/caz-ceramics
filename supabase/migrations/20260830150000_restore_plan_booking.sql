-- The 2026-08-25 rewrite of book_class (payment-choice-required drop-in flow)
-- dropped the 'plan' source entirely, leaving plan subscribers with no way
-- to spend the classes they already paid for — every booking, plan or not,
-- fell through to the cash/card drop-in flow and got charged again.
--
-- This restores plan-based booking, with the per-month class limit actually
-- enforced this time (it never was before either): the old credits_total/
-- credits_remaining columns on subscriptions were dropped, so the limit is
-- now computed by counting the student's own active 'plan'-source bookings
-- for that month against plans.classes_per_month, rather than a separate
-- counter that can drift out of sync.

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
  v_new_id uuid;
  v_month date;
  v_sub record;
  v_plan_count int;
begin
  if v_student is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  if p_source not in ('drop_in', 'plan') then
    raise exception 'PAYMENT_CHOICE_REQUIRED' using errcode = '22023';
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

    select s.id, p.classes_per_month into v_sub
      from public.subscriptions s
      join public.plans p on p.id = s.plan_id
      where s.student_id = v_student and s.month = v_month;

    if not found then
      raise exception 'NO_PLAN_THIS_MONTH' using errcode = '22023';
    end if;

    select count(*) into v_plan_count
      from public.bookings b
      join public.classes c on c.id = b.class_id
      where b.student_id = v_student
        and b.source = 'plan'
        and b.status in ('reserved','confirmed','attended')
        and date_trunc('month', c.date)::date = v_month;

    if v_plan_count >= v_sub.classes_per_month then
      raise exception 'PLAN_LIMIT_REACHED' using errcode = '22023';
    end if;

    insert into public.bookings (student_id, class_id, source, status)
      values (v_student, p_class_id, 'plan', 'confirmed')
      returning id into v_new_id;

    booking_id := v_new_id;
    status := 'confirmed';
    return next;
    return;
  end if;

  insert into public.bookings (student_id, class_id, source, status)
    values (v_student, p_class_id, 'drop_in', 'reserved')
    returning id into v_new_id;

  insert into public.payments (student_id, booking_id, amount_cents, status)
    values (v_student, v_new_id, 0, 'pending');

  booking_id := v_new_id;
  status := 'reserved';
  return next;
end;
$function$;

REVOKE ALL ON FUNCTION public.book_class(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.book_class(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.book_class(uuid, text) TO service_role;
