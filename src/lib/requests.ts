import { supabase } from "@/integrations/supabase/client";

// These RPCs (create_enrollment_request / redeem_invite / enroll_from_invite)
// are added by Block B/C migrations that may not yet be reflected in the
// generated Supabase types. We use localized casts on supabase.rpc so the
// project type-checks today (same approach as mark_attendance in admin.clases).

export type RedeemInviteClass = {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
};

export type RedeemInviteResult = {
  status: "pending" | "accepted" | "expired" | "revoked" | "invalid";
  name: string | null;
  surname: string | null;
  email: string | null;
  whatsapp: string | null;
  classes: RedeemInviteClass[];
};

/** Public enrollment request (anon-callable). Returns the new request id. */
export async function createEnrollmentRequest(input: {
  name: string;
  surname: string;
  email: string;
  whatsapp: string;
  message: string;
  classIds: string[];
}): Promise<string> {
  const { data, error } = await (
    supabase.rpc as unknown as (
      fn: "create_enrollment_request",
      args: {
        p_name: string;
        p_surname: string;
        p_email: string;
        p_whatsapp: string;
        p_message: string;
        p_class_ids: string[];
      },
    ) => Promise<{ data: string | null; error: { message: string } | null }>
  )("create_enrollment_request", {
    p_name: input.name,
    p_surname: input.surname,
    p_email: input.email,
    p_whatsapp: input.whatsapp,
    p_message: input.message,
    p_class_ids: input.classIds,
  });
  if (error) throw new Error(error.message);
  return (data ?? "") as string;
}

/** Reads an invite token and returns its status + granted classes (anon-callable). */
export async function redeemInvite(token: string): Promise<RedeemInviteResult> {
  const { data, error } = await (
    supabase.rpc as unknown as (
      fn: "redeem_invite",
      args: { p_token: string },
    ) => Promise<{ data: RedeemInviteResult | null; error: { message: string } | null }>
  )("redeem_invite", { p_token: token });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Respuesta vacía del servidor.");
  return data;
}

/** Books the granted classes as comp for the current authenticated user. Idempotent. */
export async function enrollFromInvite(token: string): Promise<void> {
  const { error } = await (
    supabase.rpc as unknown as (
      fn: "enroll_from_invite",
      args: { p_token: string },
    ) => Promise<{ error: { message: string } | null }>
  )("enroll_from_invite", { p_token: token });
  if (error) throw new Error(error.message);
}
