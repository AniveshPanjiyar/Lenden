"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionFailure, actionWarning, type UserActionStateBase } from "@/lib/action-errors";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { requireIdentity } from "@/lib/tenancy";
import type { BusinessType } from "@/lib/types";

export type SettingsActionState = UserActionStateBase;

const allowedModules = new Set<BusinessType>(["library", "guest_house", "course", "general"]);

function value(formData: FormData, key: string) {
  const entry = formData.get(key);
  return typeof entry === "string" ? entry.trim() : "";
}

function failure(error: unknown, fallback: string): SettingsActionState {
  return actionFailure<SettingsActionState>(error, {
    action: fallback,
    fallback,
  });
}

function refreshSettings(...extraPaths: string[]) {
  try {
    revalidatePath("/settings");
    revalidatePath("/account");
    extraPaths.forEach((path) => revalidatePath(path));
    return null;
  } catch (error) {
    return error;
  }
}

function refreshActionWarning(error: unknown, action: string) {
  return error
    ? actionWarning(
        error,
        { action: `${action}.revalidate`, fallback: "Could not refresh saved data." },
        "The change was saved, but refreshed data may take a moment to appear.",
      )
    : {};
}

export async function updateUserProfileAction(
  _state: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  try {
    const { user, profile } = await requireIdentity();
    const fullName = value(formData, "full_name");
    if (fullName.length < 2) {
      return {
        ok: false,
        message: "Enter your full name.",
        fieldErrors: { full_name: "Enter at least 2 characters." },
      };
    }

    const photo = formData.get("photo");
    let avatarPath = profile.avatar_url;
    if (photo instanceof File && photo.size > 0) {
      if (!photo.type.startsWith("image/")) {
        return {
          ok: false,
          message: "Choose an image file for your profile photo.",
          fieldErrors: { photo: "Choose an image file." },
        };
      }
      if (photo.size > 3 * 1024 * 1024) {
        return {
          ok: false,
          message: "Profile photo must be 3 MB or smaller.",
          fieldErrors: { photo: "Choose an image no larger than 3 MB." },
        };
      }
      const safeName = photo.name.replace(/[^a-zA-Z0-9._-]/g, "-");
      avatarPath = `users/${user.id}/${crypto.randomUUID()}-${safeName}`;
      const { error: uploadError } = await createAdminClient()
        .storage
        .from("profile-photos")
        .upload(avatarPath, photo, {
          contentType: photo.type || "image/jpeg",
          upsert: false,
        });
      if (uploadError) throw new Error(uploadError.message);
    }

    const client = await createClient();
    const { error } = await client
      .from("profiles")
      .update({ full_name: fullName, avatar_url: avatarPath })
      .eq("id", user.id);
    if (error) throw new Error(error.message);
    const refreshError = refreshSettings("/");
    return {
      ok: true,
      message: "Profile updated everywhere you use Lenden.",
      ...refreshActionWarning(refreshError, "updateUserProfileAction"),
    };
  } catch (error) {
    return failure(error, "Could not update profile.");
  }
}

export async function setUserPasswordAction(
  _state: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  try {
    const { user } = await requireIdentity();
    const password = value(formData, "password");
    const confirmation = value(formData, "password_confirmation");
    if (password.length < 8) {
      return {
        ok: false,
        message: "Use at least 8 characters.",
        fieldErrors: { password: "Use at least 8 characters." },
      };
    }
    if (password !== confirmation) {
      return {
        ok: false,
        message: "Passwords do not match.",
        fieldErrors: { password_confirmation: "Enter the same password again." },
      };
    }
    const client = await createClient();
    const { error } = await client.auth.updateUser({ password });
    if (error) throw new Error(error.message);
    const { error: profileError } = await createAdminClient()
      .from("profiles")
      .update({ must_change_password: false })
      .eq("id", user.id);
    const refreshError = refreshSettings();
    const secondaryError = profileError ?? refreshError;
    return {
      ok: true,
      message: "Your password has been updated.",
      ...(secondaryError
        ? actionWarning(
            secondaryError,
            {
              action: "setUserPasswordAction.bookkeeping",
              fallback: "Could not finish password bookkeeping.",
              userId: user.id,
            },
            profileError
              ? "The password changed, but account setup could not be marked complete. Try again."
              : "The password changed, but refreshed data may take a moment to appear.",
          )
        : {}),
    };
  } catch (error) {
    return failure(error, "Could not update password.");
  }
}

export async function requestBusinessCreationAction(
  _state: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  try {
    const { user } = await requireIdentity();
    const requestedName = value(formData, "requested_name");
    const note = value(formData, "note");
    const modules = [...new Set(formData.getAll("modules").filter(
      (entry): entry is BusinessType => (
        typeof entry === "string" && allowedModules.has(entry as BusinessType)
      ),
    ))];
    if (requestedName.length < 2) {
      return { ok: false, message: "Enter a business name.", fieldErrors: { requested_name: "Enter at least 2 characters." } };
    }
    if (modules.length === 0) {
      return { ok: false, message: "Choose at least one module.", fieldErrors: { modules: "Select at least one module." } };
    }
    if (note.length > 1000) {
      return { ok: false, message: "Keep the note under 1,000 characters.", fieldErrors: { note: "Use 1,000 characters or fewer." } };
    }

    const client = await createClient();
    const { error } = await client.from("business_creation_requests").insert({
      requested_by: user.id,
      requested_name: requestedName,
      requested_modules: modules,
      note: note || null,
      status: "pending",
    });
    if (error) {
      if (error.code === "23505") {
        return {
          ok: false,
          message: "You already have a pending request with this business name.",
        };
      }
      throw new Error(error.message);
    }
    const refreshError = refreshSettings("/admin/businesses/requests");
    return {
      ok: true,
      message: "Business request submitted for platform review.",
      ...refreshActionWarning(refreshError, "requestBusinessCreationAction"),
    };
  } catch (error) {
    return failure(error, "Could not submit the business request.");
  }
}

export async function cancelBusinessCreationRequestAction(
  _state: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  try {
    await requireIdentity();
    const requestIdResult = z.uuid().safeParse(value(formData, "request_id"));
    if (!requestIdResult.success) return { ok: false, message: "This business request is invalid." };
    const client = await createClient();
    const { error } = await client.rpc("cancel_business_creation_request", {
      target_request_id: requestIdResult.data,
    });
    if (error) throw error;
    const refreshError = refreshSettings("/admin/businesses/requests");
    return {
      ok: true,
      message: "Business request cancelled.",
      ...refreshActionWarning(refreshError, "cancelBusinessCreationRequestAction"),
    };
  } catch (error) {
    return failure(error, "Could not cancel the business request.");
  }
}

export async function acceptBusinessInvitationAction(
  _state: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  try {
    await requireIdentity();
    const invitationIdResult = z.uuid().safeParse(value(formData, "invitation_id"));
    if (!invitationIdResult.success) return { ok: false, message: "This invitation is invalid." };
    const client = await createClient();
    const { error } = await client.rpc("accept_business_invitation", {
      target_invitation_id: invitationIdResult.data,
    });
    if (error) throw error;
    const refreshError = refreshSettings("/");
    return {
      ok: true,
      message: "Business invitation accepted.",
      ...refreshActionWarning(refreshError, "acceptBusinessInvitationAction"),
    };
  } catch (error) {
    return failure(error, "Could not accept the business invitation.");
  }
}

export async function declineBusinessInvitationAction(
  _state: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  try {
    await requireIdentity();
    const invitationIdResult = z.uuid().safeParse(value(formData, "invitation_id"));
    const client = await createClient();
    const { error } = await client.rpc("decline_business_invitation", {
      target_invitation_id: invitationIdResult.data,
    });
    if (error) throw error;
    const refreshError = refreshSettings();
    return {
      ok: true,
      message: "Business invitation declined.",
      ...refreshActionWarning(refreshError, "declineBusinessInvitationAction"),
    };
  } catch (error) {
    return failure(error, "Could not decline the business invitation.");
  }
}
