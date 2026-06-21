import { supabase } from "@/integrations/supabase/client";

/**
 * Shared client helpers for the admin tools (Block B + C).
 *
 * The new tables / RPCs for enrollment requests and invites may not yet be
 * reflected in the generated Supabase types, so the edge-function results are
 * typed locally here. The functions themselves call `supabase.functions.invoke`
 * which is untyped, so no casts are needed.
 */

export type AcceptRequestResult = { invite_url: string; token: string };

/**
 * Accept an enrollment request, granting the selected classes. Triggers the
 * `accept-request` edge function which creates the invite, sends the invite
 * e-mail (Resend) and returns the invite URL for the copy-to-clipboard flow.
 */
export async function acceptRequest(
  requestId: string,
  grantedClassIds: string[],
): Promise<AcceptRequestResult> {
  const { data, error } = await supabase.functions.invoke("accept-request", {
    body: { request_id: requestId, granted_class_ids: grantedClassIds },
  });
  if (error) throw new Error(error.message);
  if (!data?.invite_url) throw new Error(data?.error ?? "No se recibió el enlace de invitación");
  return data as AcceptRequestResult;
}

/**
 * Reject an enrollment request by setting its status to `rejected`.
 * Direct table update guarded by RLS (`is_admin()`).
 */
export async function rejectRequest(requestId: string): Promise<void> {
  const { error } = await (
    supabase.from as unknown as (table: "enrollment_requests") => {
      update: (values: { status: string }) => {
        eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
      };
    }
  )("enrollment_requests")
    .update({ status: "rejected" })
    .eq("id", requestId);
  if (error) throw new Error(error.message);
}

/**
 * Send a payment reminder for a student tied to a plan. Triggers the
 * `send-payment-reminder` edge function which creates a Stripe checkout link
 * and enqueues a `payment_reminder` notification.
 */
export async function sendPaymentReminder(studentId: string, planId: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke("send-payment-reminder", {
    body: { student_id: studentId, plan_id: planId },
  });
  if (error) throw new Error(error.message);
  if (data && data.ok === false) throw new Error(data.error ?? "No se pudo enviar el recordatorio");
}

/** Copy text to the clipboard. Returns whether the copy succeeded. */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
