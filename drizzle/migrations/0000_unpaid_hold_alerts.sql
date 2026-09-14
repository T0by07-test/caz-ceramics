-- lovable-cron-fallback-reviewed: 48 runs/day; the warning must reach the student before the 3h unpaid hold is released, so the check runs every 30 minutes
-- 1. Warn the student ~1h before an unpaid drop-in hold is released.
create or replace function public.warn_expiring_drop_in_holds()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_count int := 0;
begin
  for v_row in
    select b.student_id,
           jsonb_agg(jsonb_build_object(
             'date', c.date, 'start_time', c.start_time,
             'end_time', c.end_time, 'teacher', c.teacher, 'audience', c.audience
           ) order by c.date) as classes,
           coalesce(sum((select max(p3.amount_cents) from public.payments p3
                          where p3.booking_id = b.id and p3.amount_cents > 0)), 0) as amount_cents,
           min(b.created_at) as first_created
      from public.bookings b
      join public.classes c on c.id = b.class_id
     where b.source = 'drop_in'
       and b.status = 'reserved'
       and b.created_at < now() - interval '120 minutes'
       and b.created_at > now() - interval '180 minutes'
       and not exists (
         select 1 from public.payments p
          where p.booking_id = b.id
            and (p.status = 'confirmed' or p.method in ('cash','bizum'))
       )
       and not exists (
         select 1 from public.payments p2
          where p2.student_id = b.student_id
            and p2.status = 'confirmed'
            and p2.amount_cents > 0
            and p2.created_at > b.created_at - interval '7 days'
       )
     group by b.student_id
  loop
    perform public.enqueue_notification(
      v_row.student_id,
      'payment_hold_warning',
      jsonb_build_object('classes', v_row.classes, 'amount_cents', v_row.amount_cents),
      to_char(v_row.first_created, 'YYYYMMDDHH24MI')
    );
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.warn_expiring_drop_in_holds() from public, anon, authenticated;

-- 2. Notify the student and every admin when a hold is actually released.
create or replace function public.expire_pending_drop_ins()
returns integer
language plpgsql
security definer
set search_path = public
as $$
DECLARE v_row record; v_count int := 0; v_admin record;
BEGIN
  FOR v_row IN
    SELECT b.id AS booking_id, b.class_id, b.student_id,
           c.date, c.start_time, c.end_time, c.teacher, c.audience,
           (select max(p3.amount_cents) from public.payments p3
             where p3.booking_id = b.id and p3.amount_cents > 0) as amount_cents,
           coalesce(nullif(trim(coalesce(pr.name,'') || ' ' || coalesce(pr.surname,'')), ''), pr.email, '—') as student_name
      FROM public.bookings b
      JOIN public.classes c ON c.id = b.class_id
      LEFT JOIN public.profiles pr ON pr.id = b.student_id
     WHERE b.source = 'drop_in'
       AND b.status = 'reserved'
       AND b.created_at < now() - interval '180 minutes'
       AND NOT EXISTS (
         SELECT 1 FROM public.payments p
          WHERE p.booking_id = b.id
            AND (p.status = 'confirmed' OR p.method IN ('cash', 'bizum'))
       )
       AND NOT EXISTS (
         SELECT 1 FROM public.payments p2
          WHERE p2.student_id = b.student_id
            AND p2.status = 'confirmed'
            AND p2.amount_cents > 0
            AND p2.created_at > b.created_at - interval '7 days'
       )
  LOOP
    UPDATE public.bookings SET status = 'cancelled_lost', cancelled_at = now() WHERE id = v_row.booking_id;
    UPDATE public.payments SET status = 'failed'
      WHERE booking_id = v_row.booking_id AND status = 'pending';
    PERFORM public.promote_waitlist(v_row.class_id);

    PERFORM public.enqueue_notification(
      v_row.student_id,
      'booking_released_unpaid',
      jsonb_build_object('date', v_row.date, 'start_time', v_row.start_time,
        'end_time', v_row.end_time, 'teacher', v_row.teacher,
        'audience', v_row.audience, 'amount_cents', v_row.amount_cents),
      v_row.booking_id::text
    );

    FOR v_admin IN SELECT id FROM public.profiles WHERE role = 'admin' AND email IS NOT NULL LOOP
      PERFORM public.enqueue_notification(
        v_admin.id,
        'admin_booking_released_unpaid',
        jsonb_build_object('student_name', v_row.student_name,
          'date', v_row.date, 'start_time', v_row.start_time,
          'end_time', v_row.end_time, 'teacher', v_row.teacher,
          'audience', v_row.audience, 'amount_cents', v_row.amount_cents),
        v_row.booking_id::text
      );
    END LOOP;

    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

revoke all on function public.expire_pending_drop_ins() from public, anon, authenticated;

-- 3. Admin can give a released seat back, as pending cash so it is not re-released.
create or replace function public.admin_restore_released_booking(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking record;
  v_amount int;
  v_booked int;
begin
  if not public.is_admin() then
    raise exception 'Solo la administración puede restaurar reservas';
  end if;

  select b.*, c.capacity_max into v_booking
    from public.bookings b join public.classes c on c.id = b.class_id
   where b.id = p_booking_id;
  if v_booking is null then
    raise exception 'Reserva no encontrada';
  end if;
  if v_booking.status not in ('cancelled_lost', 'cancelled_recoverable') then
    raise exception 'Esta reserva no está cancelada';
  end if;

  select count(*) into v_booked from public.bookings b2
   where b2.class_id = v_booking.class_id
     and b2.status in ('reserved', 'confirmed', 'attended');
  if v_booked >= v_booking.capacity_max then
    raise exception 'La clase está completa';
  end if;

  select max(amount_cents) into v_amount from public.payments
   where booking_id = p_booking_id and amount_cents > 0;

  update public.bookings
     set status = 'reserved', cancelled_at = null
   where id = p_booking_id;

  update public.payments set status = 'failed'
   where booking_id = p_booking_id and status = 'pending';

  insert into public.payments (student_id, booking_id, amount_cents, status, method)
  values (v_booking.student_id, p_booking_id, coalesce(v_amount, 0), 'pending', 'cash');
end;
$$;

revoke all on function public.admin_restore_released_booking(uuid) from public, anon;
grant execute on function public.admin_restore_released_booking(uuid) to authenticated;

-- 4. Run the warning check every 30 minutes.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('warn-expiring-drop-in-holds')
      where exists (select 1 from cron.job where jobname = 'warn-expiring-drop-in-holds');
    perform cron.schedule('warn-expiring-drop-in-holds', '*/30 * * * *',
      $cron$select public.warn_expiring_drop_in_holds();$cron$);
  end if;
end $$;