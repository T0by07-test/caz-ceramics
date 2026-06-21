-- Block C: allow anonymous (logged-out) visitors to read SCHEDULED classes only,
-- so the public enrollment-request form (/solicitar) can show the class picker.
-- Read-only, scheduled classes only (date/time/capacity) — no bookings/PII exposed
-- (bookings RLS stays student-owned, so anon cannot read attendance/booked counts).

DROP POLICY IF EXISTS "classes_select_scheduled_anon" ON public.classes;
CREATE POLICY "classes_select_scheduled_anon"
  ON public.classes
  FOR SELECT
  TO anon
  USING (status = 'scheduled');
