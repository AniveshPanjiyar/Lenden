"use client";

import {
  BookOpen,
  GraduationCap,
  Hotel,
  MessageCircle,
  Plus,
  ReceiptText,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  deleteCourseAction,
  deleteReferralAction,
  deleteRoomAction,
  reviewChangeRequestAction,
  saveCourseAction,
  saveCourseMessageAction,
  saveReferralAction,
  saveRoomAction,
  setCourseActiveAction,
  setReferralActiveAction,
  setRoomActiveAction,
} from "@/app/actions";
import { normalizeActionError } from "@/lib/action-errors";
import { businessLabels, formatMoney } from "@/lib/constants";
import { useSafeActionState as useActionState } from "@/lib/use-safe-action-state";
import type {
  ActionResult,
  BusinessType,
  ChangeRequest,
  Course,
  ReferralCode,
  Room,
} from "@/lib/types";
import {
  saveBusinessModulesAction,
  saveMessageTemplatesAction,
  type BusinessUserActionState,
} from "./actions";

type ProfileOption = { id: string; fullName: string; role: string };
type BusinessAction = (formData: FormData) => Promise<ActionResult>;
const actionIdempotencyField = "_action_idempotency_key";

function resultMessage(result: ActionResult) {
  const message = result.message ?? (result.ok ? "Saved." : "Could not save changes.");
  const warning = result.ok && result.warning ? ` ${result.warning}` : "";
  const reference = result.errorId ? ` Reference: ${result.errorId}.` : "";
  return `${message}${warning}${reference}`;
}

function actionFormData(form?: HTMLFormElement) {
  const formData = form ? new FormData(form) : new FormData();
  const existingKey = form?.dataset.idempotencyKey;
  const requestKey = existingKey && existingKey.trim() ? existingKey : crypto.randomUUID();
  if (form) form.dataset.idempotencyKey = requestKey;
  formData.set(actionIdempotencyField, requestKey);
  return formData;
}

function clientActionError(action: string, error: unknown): ActionResult {
  return {
    ok: false,
    ...normalizeActionError(error, {
      action,
      fallback: "Could not save changes.",
    }),
  };
}

function focusFirstInvalidField(form: HTMLFormElement, result: ActionResult, feedbackId: string) {
  form.querySelectorAll<HTMLElement>("[aria-invalid=true]").forEach((field) => {
    field.removeAttribute("aria-invalid");
    field.removeAttribute("aria-describedby");
  });
  if (result.ok || !result.fieldErrors) return;
  const firstFieldName = Object.keys(result.fieldErrors)[0];
  if (!firstFieldName) return;
  const field = [...form.elements].find(
    (element): element is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement =>
      element instanceof HTMLElement && "name" in element && element.name === firstFieldName,
  );
  if (!field) return;
  field.setAttribute("aria-invalid", "true");
  field.setAttribute("aria-describedby", feedbackId);
  field.focus();
}

function BusinessMutationForm({
  action,
  className,
  children,
  onResult,
}: {
  action: BusinessAction;
  className?: string;
  children: React.ReactNode;
  onResult: (result: ActionResult) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [localResult, setLocalResult] = useState<ActionResult | null>(null);
  const feedbackId = `business-action-${action.name}`;
  return (
    <form
      className={className}
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        if (!form.checkValidity()) {
          form.reportValidity();
          return;
        }
        if (form.dataset.submitting === "true") return;
        const formData = actionFormData(form);
        form.dataset.submitting = "true";
        setLocalResult(null);
        startTransition(async () => {
          try {
            const result = await action(formData);
            delete form.dataset.idempotencyKey;
            setLocalResult(result);
            onResult(result);
            focusFirstInvalidField(form, result, feedbackId);
            if (result.ok) form.reset();
          } catch (error) {
            const result = clientActionError(action.name, error);
            setLocalResult(result);
            onResult(result);
          } finally {
            delete form.dataset.submitting;
          }
        });
      }}
    >
      {children}
      {localResult && (!localResult.ok || localResult.warning) ? (
        <p
          className={localResult.ok ? "form-warning" : "form-error"}
          id={feedbackId}
          role={localResult.ok ? "status" : "alert"}
          aria-live={localResult.ok ? "polite" : "assertive"}
        >
          {resultMessage(localResult)}
        </p>
      ) : null}
      <button className="primary-button" type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}

function DeleteButton({
  id,
  label,
  active,
  action,
  activeAction,
  onResult,
}: {
  id: string;
  label: string;
  active: boolean;
  action: BusinessAction;
  activeAction: BusinessAction;
  onResult: (result: ActionResult) => void;
}) {
  const [pending, startTransition] = useTransition();
  const submittingRef = useRef(false);
  return (
    <button
      className={active ? "business-setup-delete" : "business-setup-delete restore"}
      type="button"
      aria-label={active ? `Remove ${label}` : `Restore ${label}`}
      disabled={pending}
      onClick={() => {
        if (submittingRef.current) return;
        if (active && !window.confirm(`Remove ${label}? If history uses it, Lenden will hide it instead of deleting it.`)) return;
        const formData = actionFormData();
        formData.set("id", id);
        if (!active) formData.set("active", "true");
        submittingRef.current = true;
        startTransition(async () => {
          try {
            onResult(await (active ? action : activeAction)(formData));
          } catch (error) {
            onResult(clientActionError(active ? action.name : activeAction.name, error));
          } finally {
            submittingRef.current = false;
          }
        });
      }}
    >
      {active ? <Trash2 size={16} /> : <Plus size={16} />}
    </button>
  );
}

export function BusinessSetupSettings({
  rooms,
  courses,
  referrals,
  profiles,
  enabledModules,
  messageTemplates,
}: {
  rooms: Room[];
  courses: Course[];
  referrals: ReferralCode[];
  profiles: ProfileOption[];
  /** Only the setup for enabled business units is shown. */
  enabledModules: BusinessType[];
  messageTemplates: { student_expired?: string; student_active?: string };
}) {
  const showRooms = enabledModules.includes("guest_house");
  const showCourses = enabledModules.includes("course");
  const showMessages = enabledModules.includes("library") || enabledModules.includes("course");
  const router = useRouter();
  const [notice, setNotice] = useState<ActionResult | null>(null);
  const salesAgents = profiles.filter((profile) => profile.role === "sales_agent");
  function handleResult(result: ActionResult) {
    setNotice(result);
    if (result.ok) router.refresh();
  }

  return (
    <div className="business-configuration-stack">
      {notice?.message ? (
        <>
          <p
            className={notice.ok ? notice.warning ? "form-warning" : "form-success" : "form-error"}
            role={notice.ok ? "status" : "alert"}
            aria-live={notice.ok ? "polite" : "assertive"}
          >
            {resultMessage(notice)}
          </p>
          <div className="toast-stack" aria-live={notice.ok ? "polite" : "assertive"}>
            <div className={notice.ok ? notice.warning ? "toast toast-warning" : "toast toast-success" : "toast toast-error"}>
              <strong>{resultMessage(notice)}</strong>
              <button type="button" aria-label="Dismiss message" onClick={() => setNotice(null)}>×</button>
            </div>
          </div>
        </>
      ) : null}

      {showMessages ? <MessageTemplatesSettings templates={messageTemplates} library={enabledModules.includes("library")} /> : null}

      {showRooms ? (
      <section className="admin-panel business-setup-section">
        <div className="business-users-heading">
          <div>
            <p className="eyebrow">Guest House</p>
            <h2>Rooms</h2>
            <p>Rooms appear while creating Guest House collections.</p>
          </div>
          <Hotel size={26} />
        </div>
        <div className="business-setup-list">
          {rooms.map((room) => (
            <article key={room.id}>
              <div>
                <strong>{room.label || room.room_number}</strong>
                <span>{room.label ? `Room ${room.room_number}` : "Room"}</span>
              </div>
              <span className={`status-pill ${room.active ? "active" : "suspended"}`}>
                {room.active ? "Active" : "Hidden"}
              </span>
              <DeleteButton
                id={room.id}
                label={room.label || room.room_number}
                active={room.active}
                action={deleteRoomAction}
                activeAction={setRoomActiveAction}
                onResult={handleResult}
              />
            </article>
          ))}
          {!rooms.length ? <p className="muted">No rooms configured.</p> : null}
        </div>
        <BusinessMutationForm action={saveRoomAction} onResult={handleResult} className="business-setup-form">
          <label>Room number<input name="room_number" required /></label>
          <label>Label (optional)<input name="label" /></label>
          <span className="business-setup-form-icon"><Plus size={18} /></span>
        </BusinessMutationForm>
      </section>
      ) : null}

      {showCourses ? (
      <section className="admin-panel business-setup-section">
        <div className="business-users-heading">
          <div>
            <p className="eyebrow">Education</p>
            <h2>Courses</h2>
            <p>Each course keeps its own student records.</p>
          </div>
          <GraduationCap size={26} />
        </div>
        <div className="business-setup-list">
          {courses.map((course) => (
            <article key={course.id} className="business-course-row">
              <div><strong>{course.name}</strong></div>
              <span className={`status-pill ${course.active ? "active" : "suspended"}`}>
                {course.active ? "Active" : "Hidden"}
              </span>
              <DeleteButton
                id={course.id}
                label={course.name}
                active={course.active}
                action={deleteCourseAction}
                activeAction={setCourseActiveAction}
                onResult={handleResult}
              />
              <details className="course-message-settings">
                <summary>
                  <MessageCircle size={16} aria-hidden="true" />
                  <span>Expired students message</span>
                  <em className={course.expired_message_template ? "is-set" : ""}>
                    {course.expired_message_template ? "Set" : "Not set"}
                  </em>
                </summary>
                <BusinessMutationForm
                  key={course.expired_message_template ?? ""}
                  action={saveCourseMessageAction}
                  onResult={handleResult}
                  className="course-message-form"
                >
                  <input type="hidden" name="id" value={course.id} />
                  <label>
                    <span>WhatsApp text for {course.name} students whose subscription has ended</span>
                    <textarea
                      name="expired_message_template"
                      rows={5}
                      maxLength={1000}
                      // Not set yet: start from the suggested Hindi message so it can be edited, then saved.
                      defaultValue={course.expired_message_template || defaultCourseExpiredMessage}
                    />
                  </label>
                  <small>
                    {"{name}"} = student name · {"{course}"} = course · {"{end_date}"} = end date · {"{roll}"} = roll number · {"{days}"} = days since it ended
                  </small>
                </BusinessMutationForm>
              </details>
            </article>
          ))}
          {!courses.length ? <p className="muted">No courses configured.</p> : null}
        </div>
        <BusinessMutationForm action={saveCourseAction} onResult={handleResult} className="business-setup-form">
          <label>Course name<input name="name" required /></label>
          <span className="business-setup-form-icon"><BookOpen size={18} /></span>
        </BusinessMutationForm>
      </section>
      ) : null}

      {showCourses ? (
      <section className="admin-panel business-setup-section">
        <div className="business-users-heading">
          <div>
            <p className="eyebrow">Sales</p>
            <h2>Coupons</h2>
            <p>Assign referral discounts and agent incentives.</p>
          </div>
          <ReceiptText size={26} />
        </div>
        <div className="business-setup-list">
          {referrals.map((referral) => {
            const agent = profiles.find((profile) => profile.id === referral.agent_id);
            return (
              <article key={referral.id}>
                <div>
                  <strong>{referral.code}</strong>
                  <span>{agent?.fullName ?? "No agent"} · Discount {referral.discount_type === "percentage" ? `${referral.discount_value}%` : formatMoney(referral.discount_value)}</span>
                </div>
                <span className={`status-pill ${referral.active ? "active" : "suspended"}`}>
                  {referral.active ? "Active" : "Inactive"}
                </span>
                <DeleteButton
                  id={referral.id}
                  label={referral.code}
                  active={referral.active}
                  action={deleteReferralAction}
                  activeAction={setReferralActiveAction}
                  onResult={handleResult}
                />
              </article>
            );
          })}
          {!referrals.length ? <p className="muted">No coupons configured.</p> : null}
        </div>
        <BusinessMutationForm action={saveReferralAction} onResult={handleResult} className="business-setup-form coupon">
          <label>Coupon code<input name="code" required /></label>
          <label>Sales Agent<select name="agent_id"><option value="">No agent</option>{salesAgents.map((agent) => <option key={agent.id} value={agent.id}>{agent.fullName}</option>)}</select></label>
          <label>Discount type<select name="discount_type"><option value="amount">Amount</option><option value="percentage">Percentage</option></select></label>
          <label>Discount value<input name="discount_value" type="number" min="0" step="0.01" required /></label>
          <label>Incentive type<select name="incentive_type"><option value="amount">Amount</option><option value="percentage">Percentage</option></select></label>
          <label>Incentive value<input name="incentive_value" type="number" min="0" step="0.01" required /></label>
        </BusinessMutationForm>
      </section>
      ) : null}
      {!showRooms && !showCourses && !showMessages ? (
        <p className="admin-empty">No setup is needed for the enabled business units.</p>
      ) : null}
    </div>
  );
}

function MessageTemplatesSettings({
  templates,
  library,
}: {
  templates: { student_expired?: string; student_active?: string };
  /** Library enabled: the section is the Library message setup (also the courses' fallback). */
  library: boolean;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(saveMessageTemplatesAction, initialBusinessActionState);
  useEffect(() => {
    if (state.ok) router.refresh();
  }, [router, state.ok]);
  const placeholderGuide = (
    <small>
      {"{name}"} = student name · {"{end_date}"} = end date · {"{roll}"} = roll number · {"{days}"} = days · {"{business}"} = business name
    </small>
  );

  return (
    <section className="admin-panel business-setup-section">
      <div className="business-users-heading">
        <div>
          <p className="eyebrow">WhatsApp</p>
          <h2>{library ? "Library" : "Student messages"}</h2>
          <p>
            Prefilled text for the WhatsApp button on {library ? "library " : ""}student cards.
            {library ? " Courses without their own message use the Expired students message too." : ""}
          </p>
        </div>
        {library ? <BookOpen size={26} /> : <MessageCircle size={26} />}
      </div>
      <form key={`${templates.student_expired ?? ""}|${templates.student_active ?? ""}`} action={formAction} className="message-template-panels">
        <details className="course-message-settings" open={!templates.student_expired}>
          <summary>
            <MessageCircle size={16} aria-hidden="true" />
            <span>Expired students message</span>
            <em className={templates.student_expired ? "is-set" : ""}>{templates.student_expired ? "Set" : "Not set"}</em>
          </summary>
          <div className="course-message-form">
            <label>
              <span>WhatsApp text for students whose subscription has ended</span>
              <textarea
                name="student_expired"
                rows={5}
                maxLength={1000}
                // Not set yet: start from the suggested Hindi message so it can be edited, then saved.
                defaultValue={templates.student_expired || (library ? defaultLibraryExpiredMessage : "")}
              />
            </label>
            {placeholderGuide}
          </div>
        </details>
        <details className="course-message-settings">
          <summary>
            <MessageCircle size={16} aria-hidden="true" />
            <span>Active students message</span>
            <em className={templates.student_active ? "is-set" : ""}>{templates.student_active ? "Set" : "Not set"}</em>
          </summary>
          <div className="course-message-form">
            <label>
              <span>WhatsApp text for students whose subscription is still running (optional)</span>
              <textarea
                name="student_active"
                rows={4}
                maxLength={1000}
                defaultValue={templates.student_active ?? ""}
                placeholder="नमस्ते {name}, आपका सब्सक्रिप्शन {end_date} को समाप्त होगा।"
              />
            </label>
            {placeholderGuide}
          </div>
        </details>
        {state.message ? (
          <p className={state.ok ? "form-success" : "form-error"} role={state.ok ? "status" : "alert"}>
            {state.message}
            {state.errorId ? ` Reference: ${state.errorId}.` : ""}
          </p>
        ) : null}
        <button className="primary-button" type="submit" disabled={pending}>{pending ? "Saving…" : "Save messages"}</button>
      </form>
    </section>
  );
}

const defaultLibraryExpiredMessage =
  "नमस्ते {name}, आपका लाइब्रेरी का सब्सक्रिप्शन {end_date} को समाप्त हो गया है। "
  + "अपना सब्सक्रिप्शन जारी रखने के लिए तुरंत रिन्यू करवाएँ, या पॉज़ या बंद करने के लिए संस्थान को सूचित करें।";

const defaultCourseExpiredMessage =
  "नमस्ते {name}, आपके {course} का सब्सक्रिप्शन {end_date} को समाप्त हो गया है। "
  + "अपना सब्सक्रिप्शन जारी रखने के लिए तुरंत रिन्यू करवाएँ, या पॉज़ या बंद करने के लिए संस्थान को सूचित करें।";

const initialBusinessActionState: BusinessUserActionState = {
  ok: false,
  message: "",
};

const moduleDescriptions: Record<BusinessType, string> = {
  library: "Library subscriptions, collections, and student records",
  guest_house: "Guest-house residents, rooms, and collections",
  course: "Course students, subscriptions, and collections",
  general: "General-purpose payments and collections",
};

export function BusinessModulesSettings({
  enabledModules,
}: {
  enabledModules: BusinessType[];
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    saveBusinessModulesAction,
    initialBusinessActionState,
  );

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [router, state.ok]);

  return (
    <section className="admin-panel business-modules-panel">
      <div className="business-users-heading">
        <div>
          <p className="eyebrow">Business modules</p>
          <h2>Choose how this business operates</h2>
          <p>Disabling a module blocks new activity while preserving historical records and existing Staff grants.</p>
        </div>
        <span className="status-pill active">{enabledModules.length} enabled</span>
      </div>
      <form action={formAction} className="business-module-config-form">
        <div className="business-module-config-grid">
          {(["library", "guest_house", "course", "general"] as BusinessType[]).map((module) => (
            <label key={module}>
              <input
                type="checkbox"
                name="modules"
                value={module}
                defaultChecked={enabledModules.includes(module)}
              />
              <span>
                <strong>{businessLabels[module]}</strong>
                <small>{moduleDescriptions[module]}</small>
              </span>
            </label>
          ))}
        </div>
        <div className="business-module-preservation-note">
          <strong>Safe to change</strong>
          <span>Existing payments, students, and Staff grants are never deleted. Preserved Staff access returns when a module is enabled again.</span>
        </div>
        {state.message ? (
          <p
            className={state.ok ? state.warning ? "form-warning" : "form-success" : "form-error"}
            role={state.ok ? "status" : "alert"}
            aria-live={state.ok ? "polite" : "assertive"}
          >
            {state.message}
            {state.warning ? ` ${state.warning}` : ""}
            {state.errorId ? ` Reference: ${state.errorId}.` : ""}
          </p>
        ) : null}
        <button className="primary-button" type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save business modules"}
        </button>
      </form>
    </section>
  );
}

export function ChangeApprovalsSettings({
  requests,
  profiles,
}: {
  requests: ChangeRequest[];
  profiles: ProfileOption[];
}) {
  const router = useRouter();
  const [notice, setNotice] = useState<ActionResult | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const decisionSubmittingRef = useRef(false);

  function decide(requestId: string, decision: "accepted" | "rejected") {
    if (decisionSubmittingRef.current) return;
    const formData = actionFormData();
    formData.set("request_id", requestId);
    formData.set("decision", decision);
    setPendingId(requestId);
    decisionSubmittingRef.current = true;
    startTransition(async () => {
      try {
        const result = await reviewChangeRequestAction(formData);
        setNotice(result);
        if (result.ok) router.refresh();
      } catch (error) {
        setNotice(clientActionError("reviewChangeRequestAction", error));
      } finally {
        setPendingId(null);
        decisionSubmittingRef.current = false;
      }
    });
  }

  return (
    <section className="admin-panel business-change-approvals">
      <div className="business-users-heading">
        <div>
          <p className="eyebrow">Change approvals</p>
          <h2>Transaction edit and cancellation requests</h2>
          <p>Requests are kept here with their final review state.</p>
        </div>
        <ShieldCheck size={27} />
      </div>
      {notice?.message ? (
        <p
          className={notice.ok ? notice.warning ? "form-warning" : "form-success" : "form-error"}
          role={notice.ok ? "status" : "alert"}
          aria-live={notice.ok ? "polite" : "assertive"}
        >
          {resultMessage(notice)}
        </p>
      ) : null}
      <div className="business-approval-list">
        {requests.map((request) => {
          const requester = profiles.find((profile) => profile.id === request.requested_by);
          return (
            <article key={request.id}>
              <div>
                <strong>{request.request_type === "cancel" ? "Cancel" : "Edit"} {request.record_type}</strong>
                <span>{requester?.fullName ?? "Business user"} · {request.reason || "No reason provided"}</span>
              </div>
              <span className={`status-pill ${request.status}`}>{request.status}</span>
              {request.status === "pending" ? (
                <div className="account-row-actions">
                  <button className="primary-button" type="button" disabled={isPending && pendingId === request.id} onClick={() => decide(request.id, "accepted")}>Approve</button>
                  <button className="secondary-button" type="button" disabled={isPending && pendingId === request.id} onClick={() => decide(request.id, "rejected")}>Reject</button>
                </div>
              ) : null}
            </article>
          );
        })}
        {!requests.length ? <p className="muted">No change requests.</p> : null}
      </div>
    </section>
  );
}
