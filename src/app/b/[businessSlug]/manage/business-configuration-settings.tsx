"use client";

import {
  BookOpen,
  GraduationCap,
  Hotel,
  Plus,
  ReceiptText,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  deleteCourseAction,
  deleteReferralAction,
  deleteRoomAction,
  reviewChangeRequestAction,
  saveCourseAction,
  saveReferralAction,
  saveRoomAction,
} from "@/app/actions";
import { formatMoney } from "@/lib/constants";
import type {
  ActionResult,
  ChangeRequest,
  Course,
  ReferralCode,
  Room,
} from "@/lib/types";

type ProfileOption = { id: string; fullName: string; role: string };

function resultMessage(result: ActionResult) {
  return result.message ?? (result.ok ? "Saved." : "Could not save changes.");
}

function BusinessMutationForm({
  action,
  className,
  children,
  onResult,
}: {
  action: (formData: FormData) => Promise<ActionResult>;
  className?: string;
  children: React.ReactNode;
  onResult: (result: ActionResult) => void;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <form
      className={className}
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const formData = new FormData(form);
        startTransition(async () => {
          const result = await action(formData);
          onResult(result);
          if (result.ok) form.reset();
        });
      }}
    >
      {children}
      <button className="primary-button" type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}

function DeleteButton({
  id,
  label,
  action,
  onResult,
}: {
  id: string;
  label: string;
  action: (formData: FormData) => Promise<ActionResult>;
  onResult: (result: ActionResult) => void;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      className="business-setup-delete"
      type="button"
      aria-label={`Delete ${label}`}
      disabled={pending}
      onClick={() => {
        if (!window.confirm(`Delete ${label}? Existing transaction history will be preserved.`)) return;
        const formData = new FormData();
        formData.set("id", id);
        startTransition(async () => onResult(await action(formData)));
      }}
    >
      <Trash2 size={16} />
    </button>
  );
}

export function BusinessSetupSettings({
  rooms,
  courses,
  referrals,
  profiles,
}: {
  rooms: Room[];
  courses: Course[];
  referrals: ReferralCode[];
  profiles: ProfileOption[];
}) {
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
        <p className={notice.ok ? "form-success" : "form-error"} role="status">
          {resultMessage(notice)}
        </p>
      ) : null}

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
                action={deleteRoomAction}
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

      <section className="admin-panel business-setup-section">
        <div className="business-users-heading">
          <div>
            <p className="eyebrow">Education</p>
            <h2>Courses</h2>
            <p>Main and skill courses remain separate student sources.</p>
          </div>
          <GraduationCap size={26} />
        </div>
        <div className="business-setup-list">
          {courses.map((course) => (
            <article key={course.id}>
              <div><strong>{course.name}</strong><span>{course.kind === "main" ? "Main course" : "Skill course"}</span></div>
              <span className={`status-pill ${course.active ? "active" : "suspended"}`}>
                {course.active ? "Active" : "Hidden"}
              </span>
              <DeleteButton id={course.id} label={course.name} action={deleteCourseAction} onResult={handleResult} />
            </article>
          ))}
          {!courses.length ? <p className="muted">No courses configured.</p> : null}
        </div>
        <BusinessMutationForm action={saveCourseAction} onResult={handleResult} className="business-setup-form">
          <label>Course name<input name="name" required /></label>
          <label>Type<select name="kind"><option value="main">Main course</option><option value="skill">Skill course</option></select></label>
          <span className="business-setup-form-icon"><BookOpen size={18} /></span>
        </BusinessMutationForm>
      </section>

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
                <DeleteButton id={referral.id} label={referral.code} action={deleteReferralAction} onResult={handleResult} />
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
    </div>
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

  function decide(requestId: string, decision: "accepted" | "rejected") {
    const formData = new FormData();
    formData.set("request_id", requestId);
    formData.set("decision", decision);
    setPendingId(requestId);
    startTransition(async () => {
      const result = await reviewChangeRequestAction(formData);
      setNotice(result);
      setPendingId(null);
      if (result.ok) router.refresh();
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
      {notice?.message ? <p className={notice.ok ? "form-success" : "form-error"} role="status">{resultMessage(notice)}</p> : null}
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
