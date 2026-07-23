"use server";

import { redirect } from "next/navigation";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { invitationTokenHash } from "@/lib/invitations";
import { requireIdentity } from "@/lib/tenancy";

export async function acceptInvitationTokenAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  if (token.length < 32 || token.length > 128) throw new Error("Invitation link is invalid.");
  await requireIdentity();
  const admin = createAdminClient();
  const { data: invitation, error: invitationError } = await admin
    .from("business_invitations")
    .select("id,business_id,status,expires_at")
    .eq("token_hash", invitationTokenHash(token))
    .maybeSingle();
  if (invitationError) throw new Error(invitationError.message);
  if (!invitation || invitation.status !== "pending" || new Date(invitation.expires_at).getTime() <= Date.now()) {
    throw new Error("Invitation is expired or no longer active.");
  }
  const client = await createClient();
  const { error } = await client.rpc("accept_business_invitation", { target_invitation_id: invitation.id });
  if (error) throw new Error(error.message);
  const { data: business, error: businessError } = await admin.from("businesses").select("slug").eq("id", invitation.business_id).single();
  if (businessError || !business) redirect("/settings?section=businesses");
  redirect(`/b/${business.slug}`);
}
