import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toIsoDate } from "@/lib/calendar";
import {
  resolveBookingPaymentStatus,
  type BookingPaymentStatus,
} from "@/lib/booking-payment-status";

export type UpcomingClassSlide = {
  classId: string;
  date: string;
  startTime: string;
  endTime: string;
  teacher: string | null;
  students: {
    bookingId: string;
    name: string;
    status: BookingPaymentStatus;
    /** Amount still owed for this booking, in cents (0 when nothing is due). */
    dueCents: number;
  }[];
  /** Sum of everything still owed for this class, in cents. */
  dueCents: number;
};

type BookingRow = {
  id: string;
  class_id: string;
  status: string;
  source: string;
  student_id: string;
  profiles: { name: string | null; surname: string | null; email: string | null } | null;
};

export type UpcomingClassesOptions = {
  /** Only classes taught by this instructor (used for the teacher view). */
  instructorId?: string | null;
  /** Leave cancelled bookings out of the roster. */
  hideCancelled?: boolean;
};

/** The next `limit` scheduled classes from today, each with its roster and payment/cancellation status. */
export function useUpcomingClasses(limit: number, options: UpcomingClassesOptions = {}) {
  const { instructorId = null, hideCancelled = false } = options;
  const [slides, setSlides] = useState<UpcomingClassSlide[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const todayIso = toIsoDate(new Date());
    let query = supabase
      .from("classes")
      .select("id, date, start_time, end_time, teacher, status, audience")
      .gte("date", todayIso)
      .neq("status", "cancelled_by_admin");
    if (instructorId) query = query.eq("instructor_id", instructorId);
    const { data: classes } = await query
      .order("date", { ascending: true })
      .order("start_time", { ascending: true })
      .limit(limit);


    const classIds = (classes ?? []).map((c) => c.id);
    if (classIds.length === 0) {
      setSlides([]);
      setLoading(false);
      return;
    }

    const { data: bookingsData } = await supabase
      .from("bookings")
      .select("id, class_id, status, source, student_id, profiles:student_id(name, surname, email)")
      .in("class_id", classIds);
    const allBookings = (bookingsData ?? []) as unknown as BookingRow[];
    const bookings = hideCancelled
      ? allBookings.filter(
          (b) => b.status !== "cancelled_recoverable" && b.status !== "cancelled_lost",
        )
      : allBookings;

    const studentIds = [...new Set(bookings.map((b) => b.student_id))];
    const monthStart = toIsoDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
    const { data: subs } =
      studentIds.length > 0
        ? await supabase
            .from("subscriptions")
            .select("id, student_id")
            .eq("month", monthStart)
            .in("student_id", studentIds)
        : { data: [] as { id: string; student_id: string }[] };
    const subIdByStudent = new Map((subs ?? []).map((s) => [s.student_id, s.id]));
    const subIds = [...subIdByStudent.values()];

    const bookingIds = bookings.map((b) => b.id);
    const [{ data: bookingPayments }, { data: subPayments }] = await Promise.all([
      bookingIds.length > 0
        ? supabase
            .from("payments")
            .select("booking_id, status, amount_cents")
            .in("booking_id", bookingIds)
        : Promise.resolve({
            data: [] as { booking_id: string | null; status: string; amount_cents: number }[],
          }),
      subIds.length > 0
        ? supabase.from("payments").select("subscription_id, status").in("subscription_id", subIds)
        : Promise.resolve({ data: [] as { subscription_id: string | null; status: string }[] }),
    ]);
// A booking can have several payment rows (book_class() writes a 0 € placeholder
// before checkout, the confirmed Stripe/cash row lands afterwards). A confirmed
// row always wins so a paid booking never shows as pending.
const rank = (s: string) => (s === "confirmed" ? 2 : s === "pending" ? 1 : 0);
const paymentByBooking = new Map<string | null, string>();
for (const p of bookingPayments ?? []) {
  const current = paymentByBooking.get(p.booking_id);
  if (!current || rank(p.status) > rank(current)) paymentByBooking.set(p.booking_id, p.status);
}
// Money still owed per booking: only pending rows with a real amount count
// (the 0 € placeholder carries no value).
const pendingCentsByBooking = new Map<string, number>();
for (const p of bookingPayments ?? []) {
  if (!p.booking_id || p.status !== "pending" || !p.amount_cents || p.amount_cents <= 0) continue;
  pendingCentsByBooking.set(
    p.booking_id,
    (pendingCentsByBooking.get(p.booking_id) ?? 0) + p.amount_cents,
  );
}
const paymentBySubscription = new Map<string | null, string>();
for (const p of subPayments ?? []) {
  const current = paymentBySubscription.get(p.subscription_id);
  if (!current || rank(p.status) > rank(current))
    paymentBySubscription.set(p.subscription_id, p.status);
}


    const bookingsByClass = new Map<string, BookingRow[]>();
    for (const b of bookings) {
      const list = bookingsByClass.get(b.class_id) ?? [];
      list.push(b);
      bookingsByClass.set(b.class_id, list);
    }

    const result: UpcomingClassSlide[] = (classes ?? []).map((c) => {
      const fallbackDue =
        c.audience === "kids" ? KIDS_CLASS_PRICE_CENTS : monthlyPriceCents(1);
      const students = (bookingsByClass.get(c.id) ?? []).map((b) => {
        const name =
          [b.profiles?.name, b.profiles?.surname].filter(Boolean).join(" ").trim() ||
          b.profiles?.email ||
          "—";
        const subId = subIdByStudent.get(b.student_id) ?? null;
        const status = resolveBookingPaymentStatus(
          {
            status: b.status,
            source: b.source,
            booking_id_payment_status:
              (paymentByBooking.get(b.id) as "pending" | "confirmed" | "failed" | undefined) ??
              null,
          },
          ((subId ? paymentBySubscription.get(subId) : null) as
            | "pending"
            | "confirmed"
            | "failed"
            | null
            | undefined) ?? null,
        );
        const dueCents =
          status === "pending" ? (pendingCentsByBooking.get(b.id) ?? fallbackDue) : 0;
        return { bookingId: b.id, name, status, dueCents };
      });
      return {
        classId: c.id,
        date: c.date,
        startTime: c.start_time,
        endTime: c.end_time,
        teacher: c.teacher,
        students,
        dueCents: students.reduce((sum, s) => sum + s.dueCents, 0),
      };
    });
    setSlides(result);
    setLoading(false);
  }, [limit, instructorId, hideCancelled]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  useEffect(() => {
    const channel = supabase
      .channel(`upcoming-classes-${limit}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "classes" },
        () => void fetchData(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings" },
        () => void fetchData(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "payments" },
        () => void fetchData(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetchData, limit]);

  return { slides, loading };
}
