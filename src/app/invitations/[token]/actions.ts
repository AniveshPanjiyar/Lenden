"use server";

import { redirect } from "next/navigation";
import { actionFailure, type UserActionStateBase } from "@/lib/action-errors";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { invitationTokenHash } from "@/lib/invitations";
import { requireIdentity } from "@/lib/tenancy";

export type InvitationActionState = UserActionStateBase;

export async function acceptInvitationTokenAction(
  _state: InvitationActionState,
  formData: FormData,
): Promise<InvitationActionState> {
  let destination: string | null = null;
  try {
    const token = String(formData.get("token") ?? "");
    if (token.length < 32 || token.length > 128) {
      return { ok: false, message: "Invitation link is invalid." };
    }
    const identity = await requireIdentity();
    const admin = createAdminClient();
    const { data: invitation, error: invitationError } = await admin
      .from("business_invitations")
      .select("id,business_id,status,expires_at")
      .eq("token_hash", invitationTokenHash(token))
      .maybeSingle();
    if (invitationError) throw invitationError;
    if (!invitation || invitation.status !== "pending" || new Date(invitation.expires_at).getTime() <= Date.now()) {
      return { ok: false, message: "Invitation is expired or no longer active." };
    }
    const client = await createClient();
    const { error } = await client.rpc("accept_business_invitation", { target_invitation_id: invitation.id });
    if (error) throw error;
    const { data: business, error: businessError } = await admin
      .from("businesses")
      .select("slug")
      .eq("id", invitation.business_id)
      .single();
    if (businessError || !business) {
      return {
        ok: true,
        message: "Invitation accepted.",
        warning: "The business page could not be opened automatically. Open it from Settings.",
      };
    }
    destination = `/b/${business.slug}`;
    void identity;
  } catch (error) {
    return actionFailure<InvitationActionState>(error, {
      action: "acceptInvitationTokenAction",
      fallback: "Could not accept this invitation.",
    });
  }
  redirect(destination ?? "/settings?section=businesses");
}
