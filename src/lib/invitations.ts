import "server-only";

import { createHash, randomBytes } from "node:crypto";

export function createInvitationToken() {
  return randomBytes(32).toString("base64url");
}

export function invitationTokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function invitationState(row: {
  status: "pending" | "accepted" | "declined" | "revoked";
  expires_at: string;
}) {
  return row.status === "pending" && new Date(row.expires_at).getTime() <= Date.now() ? "expired" : row.status;
}

