import { supabase } from "@/integrations/supabase/client";

export type JoinWaitlistResult = { waitlist_id: string; pos: number };

export async function joinWaitlist(classId: string): Promise<JoinWaitlistResult> {
  const { data, error } = await supabase.rpc("join_waitlist", { p_class_id: classId });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("Respuesta vacía del servidor.");
  return row as JoinWaitlistResult;
}

export async function leaveWaitlist(waitlistId: string): Promise<void> {
  const { error } = await supabase.from("waitlist").delete().eq("id", waitlistId);
  if (error) throw new Error(error.message);
}

export async function getWaitlistCount(classId: string): Promise<number> {
  const { count, error } = await supabase
    .from("waitlist")
    .select("id", { count: "exact", head: true })
    .eq("class_id", classId);
  if (error) throw new Error(error.message);
  return count ?? 0;
}