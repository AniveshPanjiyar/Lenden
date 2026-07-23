"use client";
/* eslint-disable @next/next/no-img-element */

import { useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  Check,
  CircleHelp,
  ExternalLink,
  KeyRound,
  Languages,
  Link2,
  LockKeyhole,
  Mail,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useActionState,
  useEffect,
  useMemo,
  useState,
} from "react";
import { logoutAction } from "@/app/actions";
import { createClient as createBrowserSupabaseClient } from "@/lib/supabase/client";
import { businessLabels } from "@/lib/constants";
import { withReturnTo } from "@/lib/navigation";
import type {
  BusinessRole,
  SettingsSection,
  UserSettingsPayload,
} from "@/lib/types";
import {
  acceptBusinessInvitationAction,
  cancelBusinessCreationRequestAction,
  declineBusinessInvitationAction,
  requestBusinessCreationAction,
  setUserPasswordAction,
  updateUserProfileAction,
  type SettingsActionState,
} from "./actions";

const initialState: SettingsActionState = { ok: null, message: "" };
const sections: Array<{
  id: SettingsSection;
  label: string;
  description: string;
  icon: React.ReactNode;
}> = [
  {
    id: "profile",
    label: "Profile & security",
    description: "Identity and sign-in methods",
    icon: <UserRound size={19} />,
  },
  {
    id: "businesses",
    label: "Businesses & access",
    description: "Memberships and invitations",
    icon: <Building2 size={19} />,
  },
  {
    id: "contact",
    label: "Contact Us",
    description: "Support and business requests",
    icon: <CircleHelp size={19} />,
  },
  {
    id: "preferences",
    label: "Preferences",
    description: "Language on this device",
    icon: <Languages size={19} />,
  },
];

function roleLabel(role: BusinessRole) {
  if (role === "primary_owner") return "Owner";
  if (role === "co_owner") return "Manager";
  if (role === "sales_agent") return "Sales Agent";
  return "Staff";
}

function stableDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "U";
}

function ActionMessage({ state }: { state: SettingsActionState }) {
  return state.message ? (
    <p
      className={state.ok ? "form-success" : "form-error"}
      role="status"
    >
      {state.message}
    </p>
  ) : null;
}

function SettingsNav({
  activeSection,
  returnTo,
}: {
  activeSection: SettingsSection;
  returnTo: string;
}) {
  return (
    <nav className="settings-section-nav" aria-label="Settings sections">
      {sections.map((section) => (
        <Link
          key={section.id}
          className={activeSection === section.id ? "active" : undefined}
          aria-current={activeSection === section.id ? "page" : undefined}
          href={withReturnTo(`/settings?section=${section.id}`, returnTo)}
        >
          {section.icon}
          <span>
            <strong>{section.label}</strong>
            <small>{section.description}</small>
          </span>
        </Link>
      ))}
    </nav>
  );
}

function ProfileSection({
  payload,
  returnTo,
}: {
  payload: UserSettingsPayload;
  returnTo: string;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [profileState, profileAction, profilePending] = useActionState(
    updateUserProfileAction,
    initialState,
  );
  const [passwordState, passwordAction, passwordPending] = useActionState(
    setUserPasswordAction,
    initialState,
  );
  const [photoPreview, setPhotoPreview] = useState(payload.profile.avatarUrl);
  const [linkMessage, setLinkMessage] = useState("");
  const [linkPending, setLinkPending] = useState(false);
  const providers = useMemo(
    () => new Set(payload.identities.map((identity) => identity.provider)),
    [payload.identities],
  );
  const hasPassword = providers.has("email");
  const hasGoogle = providers.has("google");

  useEffect(() => {
    if (!profileState.ok) return;
    void queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
    router.refresh();
  }, [profileState, queryClient, router]);

  async function connectGoogle() {
    setLinkPending(true);
    setLinkMessage("");
    const next = withReturnTo("/settings?section=profile&linked=google", returnTo);
    const supabase = createBrowserSupabaseClient({ detectSessionInUrl: false });
    const { data, error } = await supabase.auth.linkIdentity({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    if (error) {
      setLinkMessage(error.message);
      setLinkPending(false);
      return;
    }
    if (data.url) {
      window.location.assign(data.url);
      return;
    }
    setLinkMessage("Could not start Google account linking.");
    setLinkPending(false);
  }

  return (
    <div className="settings-section-stack">
      <section className="settings-card">
        <div className="settings-card-heading">
          <div>
            <p className="eyebrow">Personal profile</p>
            <h2>Your identity</h2>
            <p>Your name and photo follow you across every business.</p>
          </div>
          <span className="settings-profile-avatar" aria-label={payload.profile.fullName}>
            {photoPreview ? (
              <img src={photoPreview} alt="" />
            ) : (
              <strong>{initials(payload.profile.fullName)}</strong>
            )}
          </span>
        </div>
        <form action={profileAction} className="form-grid settings-profile-form">
          <label>
            Full name
            <input
              name="full_name"
              defaultValue={payload.profile.fullName}
              minLength={2}
              required
            />
          </label>
          <label>
            Verified email
            <input value={payload.profile.email} disabled />
          </label>
          <label className="full-span">
            Profile photo
            <input
              name="photo"
              type="file"
              accept="image/*"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) setPhotoPreview(URL.createObjectURL(file));
              }}
            />
            <small>JPG, PNG, or WebP up to 3 MB.</small>
          </label>
          <ActionMessage state={profileState} />
          <button
            className="primary-button"
            type="submit"
            disabled={profilePending}
          >
            {profilePending ? "Saving…" : "Save profile"}
          </button>
        </form>
      </section>

      <section className="settings-card">
        <div className="settings-card-heading">
          <div>
            <p className="eyebrow">Account security</p>
            <h2>Sign-in methods</h2>
            <p>Your password is private. Business Owners cannot set or reset it.</p>
          </div>
          <ShieldCheck size={28} />
        </div>
        <div className="linked-identity-list">
          <article>
            <span><Mail size={19} /></span>
            <div>
              <strong>Email and password</strong>
              <small>{hasPassword ? "Connected" : "Password not set"}</small>
            </div>
            <span className={hasPassword ? "identity-connected" : "identity-available"}>
              {hasPassword ? <Check size={15} /> : <KeyRound size={15} />}
              {hasPassword ? "Connected" : "Available"}
            </span>
          </article>
          <article>
            <span><Link2 size={19} /></span>
            <div>
              <strong>Google</strong>
              <small>{hasGoogle ? "Connected to this account" : "Use the same verified email"}</small>
            </div>
            {hasGoogle ? (
              <span className="identity-connected"><Check size={15} />Connected</span>
            ) : (
              <button
                className="secondary-button"
                type="button"
                onClick={() => void connectGoogle()}
                disabled={linkPending}
              >
                {linkPending ? "Connecting…" : "Connect Google"}
              </button>
            )}
          </article>
        </div>
        {linkMessage ? <p className="form-error" role="status">{linkMessage}</p> : null}

        <form action={passwordAction} className="form-grid settings-password-form">
          <div className="full-span settings-subheading">
            <LockKeyhole size={20} />
            <div>
              <h3>{hasPassword ? "Change password" : "Set password"}</h3>
              <p>{hasPassword ? "Choose a new password for email sign-in." : "Add email-and-password sign-in to this account."}</p>
            </div>
          </div>
          <label>
            New password
            <input
              name="password"
              type="password"
              minLength={8}
              autoComplete="new-password"
              required
            />
          </label>
          <label>
            Confirm password
            <input
              name="password_confirmation"
              type="password"
              minLength={8}
              autoComplete="new-password"
              required
            />
          </label>
          <ActionMessage state={passwordState} />
          <button
            className="secondary-button"
            type="submit"
            disabled={passwordPending}
          >
            {passwordPending ? "Saving…" : hasPassword ? "Change password" : "Set password"}
          </button>
        </form>
      </section>

      <section className="settings-signout-card">
        <div><strong>Sign out of Lenden</strong><p>You can sign in again with any connected method.</p></div>
        <form action={logoutAction}>
          <button className="secondary-button" type="submit">Sign out</button>
        </form>
      </section>
    </div>
  );
}

function BusinessesSection({
  payload,
  returnTo,
}: {
  payload: UserSettingsPayload;
  returnTo: string;
}) {
  const activeAccesses = payload.accesses.filter((item) => (
    item.status === "active" && item.businessStatus === "active"
  ));
  const unavailableAccesses = payload.accesses.filter((item) => (
    item.status !== "active" || item.businessStatus !== "active"
  ));
  return (
    <div className="settings-section-stack">
      <section className="settings-card">
        <div className="settings-card-heading">
          <div>
            <p className="eyebrow">Businesses</p>
            <h2>Your access</h2>
            <p>One account can have a different role in each business.</p>
          </div>
          <Building2 size={28} />
        </div>
        {activeAccesses.length ? (
          <div className="settings-business-list">
            {activeAccesses.map((item) => (
              <article key={item.businessId}>
                <div>
                  <strong>{item.name}</strong>
                  <span>{roleLabel(item.role)}</span>
                </div>
                <div className="account-row-actions">
                  <Link className="secondary-button" href={`/b/${item.slug}`}>
                    Open business
                  </Link>
                  {item.canManage ? (
                    <Link
                      className="admin-link-button"
                      href={withReturnTo(`/b/${item.slug}/manage`, withReturnTo("/settings?section=businesses", returnTo))}
                    >
                      Manage
                    </Link>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="account-empty">
            <strong>No active business yet</strong>
            <p>Accept an invitation below or request a business from Contact Us.</p>
            <Link
              className="secondary-button"
              href={withReturnTo("/settings?section=contact", returnTo)}
            >
              Request a business
            </Link>
          </div>
        )}
        {unavailableAccesses.length ? (
          <details className="account-details">
            <summary>Suspended or unavailable ({unavailableAccesses.length})</summary>
            <div className="settings-business-list">
              {unavailableAccesses.map((item) => (
                <article key={item.businessId}>
                  <div>
                    <strong>{item.name}</strong>
                    <span>{item.status === "suspended" ? "Access suspended" : "Business unavailable"}</span>
                  </div>
                </article>
              ))}
            </div>
          </details>
        ) : null}
      </section>

      <section className="settings-card">
        <div className="settings-card-heading">
          <div>
            <p className="eyebrow">Invitations</p>
            <h2>Pending access</h2>
            <p>Access starts only after you accept with this verified email.</p>
          </div>
          <Mail size={28} />
        </div>
        {payload.invitations.length ? (
          <div className="settings-business-list">
            {payload.invitations.map((invitation) => (
              <article key={invitation.id}>
                <div>
                  <strong>{invitation.businessName}</strong>
                  <span>
                    {roleLabel(invitation.role)} · {invitation.state === "expired"
                      ? "Expired"
                      : `Expires ${stableDate(invitation.expiresAt)}`}
                  </span>
                </div>
                {invitation.state === "pending" ? (
                  <div className="account-row-actions">
                    <form action={acceptBusinessInvitationAction}>
                      <input type="hidden" name="invitation_id" value={invitation.id} />
                      <button className="primary-button" type="submit">Accept</button>
                    </form>
                    <form action={declineBusinessInvitationAction}>
                      <input type="hidden" name="invitation_id" value={invitation.id} />
                      <button className="secondary-button" type="submit">Decline</button>
                    </form>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        ) : <p className="muted">No pending invitations.</p>}
      </section>

      {payload.profile.platformRole === "platform_admin" ? (
        <section className="settings-card settings-admin-shortcut">
          <div>
            <p className="eyebrow">Platform administration</p>
            <h2>Admin Console</h2>
            <p>Review businesses, requests, and audited support access.</p>
          </div>
          <Link
            className="primary-button"
            href={withReturnTo("/admin/businesses", withReturnTo("/settings?section=businesses", returnTo))}
          >
            Open Admin Console <ExternalLink size={16} />
          </Link>
        </section>
      ) : null}
    </div>
  );
}

function ContactSection({
  payload,
}: {
  payload: UserSettingsPayload;
}) {
  const [requestState, requestAction, requestPending] = useActionState(
    requestBusinessCreationAction,
    initialState,
  );
  return (
    <div className="settings-section-stack">
      <section className="settings-card settings-contact-card">
        <span><Mail size={24} /></span>
        <div>
          <p className="eyebrow">Need help?</p>
          <h2>Contact Lenden support</h2>
          <p>Questions about access or your account go directly to our support email.</p>
          <a className="secondary-button" href={`mailto:${payload.supportEmail}`}>
            Email {payload.supportEmail}
          </a>
        </div>
      </section>

      <section className="settings-card">
        <div className="settings-card-heading">
          <div>
            <p className="eyebrow">Business creation</p>
            <h2>Request another business</h2>
            <p>A platform administrator reviews and finalizes every request.</p>
          </div>
          <Building2 size={28} />
        </div>
        <form action={requestAction} className="form-grid">
          <label>
            Business name
            <input name="requested_name" minLength={2} required />
          </label>
          <fieldset className="account-module-grid full-span">
            <legend>Requested modules</legend>
            {(["library", "guest_house", "course", "general"] as const).map((module) => (
              <label key={module}>
                <input name="modules" type="checkbox" value={module} />
                {businessLabels[module]}
              </label>
            ))}
          </fieldset>
          <label className="full-span">
            Note (optional)
            <textarea name="note" rows={3} maxLength={1000} />
          </label>
          <ActionMessage state={requestState} />
          <button className="primary-button" type="submit" disabled={requestPending}>
            {requestPending ? "Submitting…" : "Submit request"}
          </button>
        </form>
      </section>

      <section className="settings-card">
        <div className="settings-card-heading">
          <div>
            <p className="eyebrow">Request history</p>
            <h2>All business requests</h2>
          </div>
          <span className="status-pill">{payload.requests.length} total</span>
        </div>
        {payload.requests.length ? (
          <div className="settings-request-list">
            {payload.requests.map((request) => (
              <article key={request.id}>
                <div>
                  <strong>{request.name}</strong>
                  <span>{request.modules.map((module) => businessLabels[module]).join(", ")}</span>
                  <small>Requested {stableDate(request.createdAt)}</small>
                </div>
                <div className="account-request-status">
                  <span className={`status-pill ${request.status}`}>{request.status}</span>
                  {request.reason ? <p>{request.reason}</p> : null}
                  {request.businessSlug ? (
                    <Link href={`/b/${request.businessSlug}`}>Open business</Link>
                  ) : null}
                  {request.status === "pending" ? (
                    <form action={cancelBusinessCreationRequestAction}>
                      <input type="hidden" name="request_id" value={request.id} />
                      <button className="admin-link-button" type="submit">Cancel request</button>
                    </form>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        ) : <p className="muted">No business requests yet.</p>}
      </section>
    </div>
  );
}

function PreferencesSection() {
  const [language, setLanguage] = useState<"en" | "hi">("en");
  useEffect(() => {
    const stored = window.localStorage.getItem("lenden-language");
    if (stored === "en" || stored === "hi") {
      queueMicrotask(() => setLanguage(stored));
    }
  }, []);
  function chooseLanguage(value: "en" | "hi") {
    setLanguage(value);
    window.localStorage.setItem("lenden-language", value);
  }
  return (
    <section className="settings-card">
      <div className="settings-card-heading">
        <div>
          <p className="eyebrow">Language</p>
          <h2>Choose your app language</h2>
          <p>This preference is stored on this device.</p>
        </div>
        <Languages size={28} />
      </div>
      <div className="settings-language-grid">
        <button
          type="button"
          className={language === "en" ? "active" : undefined}
          aria-pressed={language === "en"}
          onClick={() => chooseLanguage("en")}
        >
          <strong>English</strong><span>English (US)</span>
        </button>
        <button
          type="button"
          className={language === "hi" ? "active" : undefined}
          aria-pressed={language === "hi"}
          onClick={() => chooseLanguage("hi")}
        >
          <strong>हिंदी</strong><span>Hindi</span>
        </button>
      </div>
    </section>
  );
}

export default function SettingsClient({
  payload,
  activeSection,
  returnTo,
  flashMessage,
  flashTone,
}: {
  payload: UserSettingsPayload;
  activeSection: SettingsSection;
  returnTo: string;
  flashMessage: string;
  flashTone: "success" | "error";
}) {
  return (
    <div className="settings-layout">
      <SettingsNav activeSection={activeSection} returnTo={returnTo} />
      <div className="settings-mobile-section-picker">
        <label htmlFor="settings-section">Settings section</label>
        <select
          id="settings-section"
          value={activeSection}
          onChange={(event) => {
            window.location.assign(withReturnTo(`/settings?section=${event.target.value}`, returnTo));
          }}
        >
          {sections.map((section) => (
            <option key={section.id} value={section.id}>{section.label}</option>
          ))}
        </select>
      </div>
      <main className="settings-content">
        {flashMessage ? (
          <p className={flashTone === "success" ? "form-success settings-flash" : "form-error settings-flash"} role="status">
            {flashMessage}
          </p>
        ) : null}
        {activeSection === "profile" ? <ProfileSection payload={payload} returnTo={returnTo} /> : null}
        {activeSection === "businesses" ? <BusinessesSection payload={payload} returnTo={returnTo} /> : null}
        {activeSection === "contact" ? <ContactSection payload={payload} /> : null}
        {activeSection === "preferences" ? <PreferencesSection /> : null}
      </main>
    </div>
  );
}
