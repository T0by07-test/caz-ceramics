CREATE OR REPLACE FUNCTION public.prior_adult_slot_seats(p_student uuid, p_month date, p_exclude uuid[], p_slot integer)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT count(*)::int
  FROM bookings b JOIN classes c ON c.id = b.class_id
  WHERE b.student_id = p_student AND b.source = 'drop_in'
    AND b.status IN ('reserved','confirmed','attended')
    AND c.audience <> 'kids'
    AND coalesce(b.guests,0) >= p_slot
    AND date_trunc('month', c.date) = date_trunc('month', p_month)
    AND NOT (b.id = ANY(coalesce(p_exclude, '{}'::uuid[])))
    AND EXISTS (SELECT 1 FROM payments p WHERE p.booking_id = b.id AND p.amount_cents > 0
                AND (p.status = 'confirmed' OR (p.status = 'pending' AND p.method = 'cash')))
$$;
REVOKE EXECUTE ON FUNCTION public.prior_adult_slot_seats(uuid, date, uuid[], integer) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.drop_in_amounts(p_student uuid, p_booking_ids uuid[])
RETURNS TABLE(booking_id uuid, amount_cents integer) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE r record; v_month date := NULL; v_base int[] := ARRAY[0,0,0]; v_amt int; k int;
BEGIN
  FOR r IN SELECT b.id, least(2, coalesce(b.guests,0)) g, c.audience, date_trunc('month', c.date)::date m
           FROM bookings b JOIN classes c ON c.id = b.class_id
           WHERE b.id = ANY(p_booking_ids) AND b.student_id = p_student
           ORDER BY c.audience = 'kids', date_trunc('month', c.date), c.date, c.start_time, b.id
  LOOP
    IF r.audience = 'kids' THEN
      booking_id := r.id; amount_cents := 1200 * (1 + r.g); RETURN NEXT; CONTINUE;
    END IF;
    IF v_month IS DISTINCT FROM r.m THEN
      v_month := r.m;
      FOR k IN 0..2 LOOP v_base[k+1] := public.prior_adult_slot_seats(p_student, r.m, p_booking_ids, k); END LOOP;
    END IF;
    v_amt := 0;
    FOR k IN 0..r.g LOOP
      v_amt := v_amt + public.adult_tier_cents(v_base[k+1] + 1) - public.adult_tier_cents(v_base[k+1]);
      v_base[k+1] := v_base[k+1] + 1;
    END LOOP;
    booking_id := r.id; amount_cents := v_amt; RETURN NEXT;
  END LOOP;
END $function$;

CREATE OR REPLACE FUNCTION public.quote_my_selection(p_class_ids uuid[], p_guests integer)
RETURNS integer LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE r record; v_uid uuid := auth.uid(); v_month date := NULL; v_base int[] := ARRAY[0,0,0]; v_total int := 0;
  v_g int := least(2, greatest(0, coalesce(p_guests,0))); k int;
BEGIN
  IF v_uid IS NULL THEN RETURN NULL; END IF;
  FOR r IN SELECT c.id, c.audience, date_trunc('month', c.date)::date m FROM classes c
           WHERE c.id = ANY(p_class_ids) ORDER BY c.audience = 'kids', c.date, c.start_time
  LOOP
    IF r.audience = 'kids' THEN v_total := v_total + 1200 * (1 + v_g); CONTINUE; END IF;
    IF v_month IS DISTINCT FROM r.m THEN
      v_month := r.m;
      FOR k IN 0..2 LOOP
        v_base[k+1] := public.prior_adult_slot_seats(v_uid, r.m,
          ARRAY(SELECT b.id FROM bookings b WHERE b.student_id = v_uid AND b.class_id = ANY(p_class_ids)), k);
      END LOOP;
    END IF;
    FOR k IN 0..v_g LOOP
      v_total := v_total + public.adult_tier_cents(v_base[k+1] + 1) - public.adult_tier_cents(v_base[k+1]);
      v_base[k+1] := v_base[k+1] + 1;
    END LOOP;
  END LOOP;
  RETURN v_total;
END $function$;