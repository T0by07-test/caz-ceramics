CREATE OR REPLACE FUNCTION public.booking_recovered(p_booking uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH RECURSIVE chain(bid, depth) AS (
    SELECT m.used_booking_id, 1 FROM makeups m
     WHERE m.source_booking_id = p_booking AND m.used_booking_id IS NOT NULL
    UNION
    SELECT m.used_booking_id, ch.depth + 1 FROM chain ch
      JOIN bookings ub ON ub.id = ch.bid AND ub.status = 'cancelled'
      JOIN makeups m ON m.source_booking_id = ub.id AND m.used_booking_id IS NOT NULL
     WHERE ch.depth < 20
  )
  SELECT EXISTS (SELECT 1 FROM chain ch JOIN bookings b ON b.id = ch.bid
                  WHERE b.status IN ('reserved','confirmed','attended'));
$$;

CREATE OR REPLACE FUNCTION public.prior_adult_seats(p_student uuid, p_month date, p_exclude uuid[])
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT coalesce(sum(1 + coalesce(b.guests,0)),0)::int
  FROM bookings b JOIN classes c ON c.id = b.class_id
  WHERE b.student_id = p_student AND b.source = 'drop_in'
    AND c.audience <> 'kids'
    AND date_trunc('month', c.date) = date_trunc('month', p_month)
    AND NOT (b.id = ANY(coalesce(p_exclude, '{}'::uuid[])))
    AND (
      (b.status IN ('reserved','confirmed','attended')
       AND EXISTS (SELECT 1 FROM payments p WHERE p.booking_id = b.id AND p.amount_cents > 0
                   AND (p.status = 'confirmed' OR (p.status = 'pending' AND p.method = 'cash'))))
      OR (b.status = 'cancelled' AND public.booking_recovered(b.id))
    )
$function$;

CREATE OR REPLACE FUNCTION public.prior_adult_slot_seats(p_student uuid, p_month date, p_exclude uuid[], p_slot integer)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT count(*)::int
  FROM bookings b JOIN classes c ON c.id = b.class_id
  WHERE b.student_id = p_student AND b.source = 'drop_in'
    AND c.audience <> 'kids'
    AND coalesce(b.guests,0) >= p_slot
    AND date_trunc('month', c.date) = date_trunc('month', p_month)
    AND NOT (b.id = ANY(coalesce(p_exclude, '{}'::uuid[])))
    AND (
      (b.status IN ('reserved','confirmed','attended')
       AND EXISTS (SELECT 1 FROM payments p WHERE p.booking_id = b.id AND p.amount_cents > 0
                   AND (p.status = 'confirmed' OR (p.status = 'pending' AND p.method = 'cash'))))
      OR (b.status = 'cancelled' AND public.booking_recovered(b.id))
    )
$function$;

CREATE OR REPLACE FUNCTION public.recalc_month_pending_cash(p_student uuid, p_month date)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  r record; k int; v_inc int; v_c int[] := ARRAY[0,0,0];
  v_target int := 0; v_confirmed int := 0; v_sum int := 0; v_diff int; v_take int;
  v_pending uuid[] := '{}'; v_amounts int[] := '{}'; i int; v_sessions text[] := '{}';
BEGIN
  FOR r IN
    SELECT b.id, least(2, coalesce(b.guests,0)) g, b.status,
      (SELECT coalesce(sum(p.amount_cents),0) FROM payments p WHERE p.booking_id = b.id AND p.status = 'confirmed' AND p.amount_cents > 0) conf,
      (SELECT p.id FROM payments p WHERE p.booking_id = b.id AND p.status = 'pending' AND p.method = 'cash' AND p.amount_cents > 0 ORDER BY p.created_at LIMIT 1) pend
    FROM bookings b JOIN classes c ON c.id = b.class_id
    WHERE b.student_id = p_student AND b.source = 'drop_in'
      AND c.audience <> 'kids'
      AND date_trunc('month', c.date) = date_trunc('month', p_month)
      AND (
        (b.status IN ('reserved','confirmed','attended')
         AND EXISTS (SELECT 1 FROM payments p WHERE p.booking_id = b.id AND p.amount_cents > 0
                     AND (p.status = 'confirmed' OR (p.status = 'pending' AND p.method = 'cash'))))
        OR (b.status = 'cancelled' AND public.booking_recovered(b.id))
      )
    ORDER BY c.date, c.start_time, b.created_at, b.id
  LOOP
    v_inc := 0;
    FOR k IN 0..r.g LOOP
      v_inc := v_inc + public.adult_tier_cents(v_c[k+1] + 1) - public.adult_tier_cents(v_c[k+1]);
      v_c[k+1] := v_c[k+1] + 1;
    END LOOP;
    v_confirmed := v_confirmed + r.conf;
    IF r.conf = 0 AND r.pend IS NOT NULL THEN
      v_pending := v_pending || r.pend; v_amounts := v_amounts || v_inc; v_sum := v_sum + v_inc;
    END IF;
  END LOOP;
  IF coalesce(array_length(v_pending,1),0) = 0 THEN RETURN; END IF;
  FOR k IN 0..2 LOOP v_target := v_target + public.adult_tier_cents(v_c[k+1]); END LOOP;

  v_diff := greatest(0, v_target - v_confirmed) - v_sum;
  i := array_length(v_pending,1);
  IF v_diff > 0 THEN v_amounts[i] := v_amounts[i] + v_diff; END IF;
  WHILE v_diff < 0 AND i >= 1 LOOP
    v_take := least(v_amounts[i], -v_diff);
    v_amounts[i] := v_amounts[i] - v_take; v_diff := v_diff + v_take; i := i - 1;
  END LOOP;

  FOR i IN 1..array_length(v_pending,1) LOOP
    UPDATE payments SET amount_cents = v_amounts[i]
     WHERE id = v_pending[i] AND amount_cents <> v_amounts[i];
    v_sessions := v_sessions || (SELECT stripe_session_id FROM payments WHERE id = v_pending[i]);
  END LOOP;

  FOR i IN 1..coalesce(array_length(v_sessions,1),0) LOOP
    PERFORM public.sync_cash_ledger(v_sessions[i]);
  END LOOP;
END $function$;

CREATE OR REPLACE FUNCTION public.recalc_on_makeup_use()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.used_booking_id IS DISTINCT FROM OLD.used_booking_id THEN
    PERFORM public.recalc_month_pending_cash(NEW.student_id, public.makeup_origin_month(NEW.id));
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_recalc_on_makeup_use ON public.makeups;
CREATE TRIGGER trg_recalc_on_makeup_use AFTER UPDATE OF used_booking_id ON public.makeups
FOR EACH ROW EXECUTE FUNCTION public.recalc_on_makeup_use();

REVOKE EXECUTE ON FUNCTION public.booking_recovered(uuid) FROM PUBLIC, anon;