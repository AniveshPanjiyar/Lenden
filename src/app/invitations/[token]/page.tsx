import Link from "next/link";
import { Landmark } from "lucide-react";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { invitationState, invitationTokenHash } from "@/lib/invitations";
import { acceptInvitationTokenAction } from "./actions";

function roleLabel(role: string) {
  return role === "co_owner" ? "Manager" : role === "sales_agent" ? "Sales Agent" : "Staff";
}

export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createAdminClient();
  const { data: invitation } = token.length >= 32 && token.length <= 128
    ? await admin.from("business_invitations").select("id,business_id,email,intended_role,status,expires_at").eq("token_hash", invitationTokenHash(token)).maybeSingle()
    : { data: null };
  const { data: { user } } = await (await createClient()).auth.getUser();
  const active = invitation?.status === "pending" && invitationState(invitation) === "pending";
  const { data: business } = invitation ? await admin.from("businesses").select("name").eq("id", invitation.business_id).maybeSingle() : { data: null };
  const nextPath = `/invitations/${encodeURIComponent(token)}`;

  return <main className="auth-page"><section className="auth-panel invitation-panel">
    <div className="brand-lockup"><span className="brand-mark"><Landmark size={22} /></span><div><p className="eyebrow">Business invitation</p><h1>{active ? `Join ${business?.name ?? "a business"}` : "Invitation unavailable"}</h1></div></div>
    {!active ? <><p className="form-error">This invitation is expired, revoked, or has already been used.</p><Link className="secondary-button" href="/account">Open your account</Link></> : <>
      <div className="invitation-summary"><span>Invited email</span><strong>{invitation.email}</strong><span>Business role</span><strong>{roleLabel(invitation.intended_role)}</strong><span>Expires</span><strong>{new Date(invitation.expires_at).toLocaleDateString()}</strong></div>
      {!user ? <><p className="muted">Sign in or create your own account using the invited email. You will return here to accept.</p><Link className="primary-button" href={`/login?next=${encodeURIComponent(nextPath)}`}>Sign in</Link><Link className="secondary-button" href={`/signup?next=${encodeURIComponent(nextPath)}`}>Create account</Link></> : user.email?.toLowerCase() !== invitation.email.toLowerCase() ? <><p className="form-error">You are signed in as {user.email}. This invitation belongs to {invitation.email}.</p><Link className="secondary-button" href="/account">Open your account</Link></> : <form action={acceptInvitationTokenAction} className="form-grid"><input type="hidden" name="token" value={token} /><p className="muted">Accepting adds business access without changing your password or other memberships.</p><button className="primary-button" type="submit">Accept invitation</button><Link className="secondary-button" href="/account">Review in account</Link></form>}
    </>}
  </section></main>;
}
