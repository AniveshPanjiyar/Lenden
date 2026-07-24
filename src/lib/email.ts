import "server-only";

const DEFAULT_CUSTOMER_FROM_EMAIL = "Lenden <support@margdarshakss.com>";

type EmailResult =
  | { ok: true; providerId: string | null }
  | { ok: false; error: string };

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character] ?? character);
}

async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
  idempotencyKey: string;
}): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL?.trim() || DEFAULT_CUSTOMER_FROM_EMAIL;
  if (!apiKey) return { ok: false, error: "Resend is not configured." };

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": input.idempotencyKey,
      },
      body: JSON.stringify({ from, to: [input.to], subject: input.subject, html: input.html }),
      cache: "no-store",
    });
    const payload = await response.json().catch(() => null) as { id?: string; message?: string } | null;
    if (!response.ok) return { ok: false, error: payload?.message ?? `Resend returned ${response.status}.` };
    return { ok: true, providerId: payload?.id ?? null };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not send email." };
  }
}

export function sendBusinessInvitationEmail(input: {
  invitationId: string;
  recipientEmail: string;
  businessName: string;
  inviterName: string;
  roleLabel: string;
  invitationUrl: string;
  generation: string;
}) {
  const business = escapeHtml(input.businessName);
  const inviter = escapeHtml(input.inviterName);
  const role = escapeHtml(input.roleLabel);
  const invitationUrl = escapeHtml(input.invitationUrl);
  return sendEmail({
    to: input.recipientEmail,
    subject: `You have been invited to ${input.businessName} on Lenden`,
    idempotencyKey: `business-invitation/${input.invitationId}/${input.generation}`,
    html: `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:auto;color:#21332b"><h1>Join ${business} on Lenden</h1><p>${inviter} invited you to join as <strong>${role}</strong>.</p><p>Sign in or create your own Lenden account with <strong>${escapeHtml(input.recipientEmail)}</strong>, then accept the invitation.</p><p><a href="${invitationUrl}" style="display:inline-block;background:#2f6f5e;color:white;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:700">Review invitation</a></p><p style="color:#63736c;font-size:13px">This link expires in 30 days. Your password is private and is never set by the business.</p></div>`,
  });
}

export function sendBusinessAccessGrantedEmail(input: {
  recipientEmail: string;
  businessId: string;
  businessName: string;
  roleLabel: string;
  businessUrl: string;
  generation: string;
}) {
  return sendEmail({
    to: input.recipientEmail,
    subject: `Access granted to ${input.businessName} on Lenden`,
    idempotencyKey: `business-access/${input.businessId}/${input.recipientEmail}/${input.generation}`,
    html: `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:auto;color:#21332b"><h1>Business access granted</h1><p>You can now open <strong>${escapeHtml(input.businessName)}</strong> on Lenden as <strong>${escapeHtml(input.roleLabel)}</strong>.</p><p><a href="${escapeHtml(input.businessUrl)}" style="display:inline-block;background:#2f6f5e;color:white;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:700">Open business</a></p><p style="color:#63736c;font-size:13px">This access is separate from your login and other business memberships.</p></div>`,
  });
}
