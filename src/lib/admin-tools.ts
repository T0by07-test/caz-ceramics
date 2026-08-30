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

async function getFunctionErrorMessage(error: {
  message: string;
  context?: unknown;
}): Promise<string> {
  const context = error.context;
  if (context instanceof Response) {
    const text = await context.text().catch(() => "");
    if (text) {
      try {
        const parsed = JSON.parse(text) as { error?: unknown; message?: unknown };
        const detail = parsed.error ?? parsed.message;
        if (typeof detail === "string" && detail.trim()) return detail;
      } catch {
        return text;
      }
    }
  }
  return error.message;
}

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
  if (error) throw new Error(await getFunctionErrorMessage(error));
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

const DELETE_MEMBER_ERRORS: Record<string, string> = {
  ADMIN_REQUIRED: "Solo un admin puede eliminar miembros.",
  MEMBER_NOT_FOUND: "El miembro ya no existe.",
  ONLY_MEMBERS_CAN_BE_DELETED: "Solo se pueden eliminar cuentas con rol Miembro.",
  HAS_REAL_PAYMENTS: "Este miembro tiene pagos registrados y no se puede eliminar.",
};

/**
 * Permanently delete a member account (test/junk profiles only — the RPC
 * refuses anyone with a real payment or a non-"user" role). Removes the auth
 * account, cascading to all their bookings/payments/tags/etc.
 */
export async function deleteMember(studentId: string): Promise<void> {
  const { error } = await (
    supabase.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ error: { message: string } | null }>
  )("admin_delete_member", { p_student_id: studentId });
  if (error) {
    const code = error.message.match(/^[A-Z_]+/)?.[0];
    throw new Error((code && DELETE_MEMBER_ERRORS[code]) ?? error.message);
  }
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
