import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type Availability = { booked_count: number; capacity_max: number };

/**
 * Public (anon-safe) occupancy per scheduled class: booked count + max capacity.
 * Backed by the public_class_availability RPC so the website calendar shows the
 * same "libres / completa" state as the admin calendar, without exposing rosters.
 */
export function usePublicAvailability() {
  const [byClassId, setByClassId] = useState<Map<string, Availability>>(new Map());

  useEffect(() => {
    let active = true;
    const load = async () => {
      const { data, error } = await supabase.rpc("public_class_availability");
      if (!active || error || !data) return;
      setByClassId(
        new Map(
          (data as { class_id: string; booked_count: number; capacity_max: number }[]).map((r) => [
            r.class_id,
            { booked_count: r.booked_count, capacity_max: r.capacity_max },
          ]),
        ),
      );
    };
    void load();

    const channel = supabase
      .channel("public-availability")
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, () => void load())
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, []);

  return byClassId;
}
