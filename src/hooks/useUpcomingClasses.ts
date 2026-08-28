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
  students: { bookingId: string; name: string; status: BookingPaymentStatus }[];
};

type BookingRow = {
  id: string;
  class_id: string;
  status: string;
  source: string;
  student_id: string;
  profiles: { name: string | null; surname: string | null; email: string | null } | null;
};

/** The next `limit` scheduled classes from today, each with its roster and payment/cancellation status. */
export function useUpcomingClasses(limit: number) {
  const [slides, setSlides] = useState<UpcomingClassSlide[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const todayIso = toIsoDate(new Date());
    const { data: classes } = await supabase
      .from("classes")
      .select("id, date, start_time, end_time, teacher, status")
      .gte("date", todayIso)
      .neq("status", "cancelled_by_admin")
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
    const bookings = (bookingsData ?? []) as unknown as BookingRow[];

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
        ? supabase.from("payments").select("booking_id, status").in("booking_id", bookingIds)
        : Promise.resolve({ data: [] as { booking_id: string | null; status: string }[] }),
      subIds.length > 0
        ? supabase.from("payments").select("subscription_id, status").in("subscription_id", subIds)
        : Promise.resolve({ data: [] as { subscription_id: string | null; status: string }[] }),
    ]);
    const paymentByBooking = new Map((bookingPayments ?? []).map((p) => [p.booking_id, p.status]));
    const paymentBySubscription = new Map(
      (subPayments ?? []).map((p) => [p.subscription_id, p.status]),
    );

    const bookingsByClass = new Map<string, BookingRow[]>();
    for (const b of bookings) {
      const list = bookingsByClass.get(b.class_id) ?? [];
      list.push(b);
      bookingsByClass.set(b.class_id, list);
    }

    const result: UpcomingClassSlide[] = (classes ?? []).map((c) => ({
      classId: c.id,
      date: c.date,
      startTime: c.start_time,
      endTime: c.end_time,
      teacher: c.teacher,
      students: (bookingsByClass.get(c.id) ?? []).map((b) => {
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
        return { bookingId: b.id, name, status };
      }),
    }));
    setSlides(result);
    setLoading(false);
  }, [limit]);

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
