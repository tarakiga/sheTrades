"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, SectionHeader } from "../ui";
import { fetchAdminAuthJson } from "../../lib/admin-auth";
import { useAdminUiCopyClient } from "../../lib/config/admin-ui-copy-client";
import { ProfileDetailsForm, type ProfileDetailsFormValue } from "./ProfileDetailsForm";
import { ProfilePasswordForm, type ProfilePasswordFormValue } from "./ProfilePasswordForm";
import { ProfileTwoFactorCard } from "./ProfileTwoFactorCard";
import { ProfileSummaryCard } from "./ProfileSummaryCard";
import { useAdminSession } from "./AdminSessionProvider";
import type { AuthStatusMessage } from "./types";

type ProfileResponse = {
  user: {
    id: string;
    fullName: string;
    email: string;
    role: "admin" | "editor" | "viewer";
    avatarUrl?: string;
    lastLoginAt?: string | null;
  };
};

function validateProfile(value: ProfileDetailsFormValue) {
  return {
    ...(value.fullName.trim() ? {} : { fullName: "Enter the name to display in the admin workspace." })
  };
}

function validatePassword(value: ProfilePasswordFormValue) {
  return {
    ...(value.currentPassword.trim() ? {} : { currentPassword: "Enter your current password." }),
    ...(value.newPassword.trim().length >= 10
      ? {}
      : { newPassword: "Use at least 10 characters for the new password." })
  };
}

function formatTimestamp(value: string | null | undefined, fallback: string) {
  if (!value) {
    return fallback;
  }
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit"
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export function ProfilePageClient() {
  const { t } = useAdminUiCopyClient();
  const router = useRouter();
  const { user, signOut, applyProfileUpdate } = useAdminSession();
  const [detailsValue, setDetailsValue] = useState<ProfileDetailsFormValue>({
    fullName: "",
    avatarUrl: ""
  });
  const [passwordValue, setPasswordValue] = useState<ProfilePasswordFormValue>({
    currentPassword: "",
    newPassword: ""
  });
  const [detailsErrors, setDetailsErrors] = useState<
    Partial<Record<keyof ProfileDetailsFormValue, string>>
  >({});
  const [passwordErrors, setPasswordErrors] = useState<
    Partial<Record<keyof ProfilePasswordFormValue, string>>
  >({});
  const [detailsStatus, setDetailsStatus] = useState<AuthStatusMessage | null>(null);
  const [passwordStatus, setPasswordStatus] = useState<AuthStatusMessage | null>(null);
  const [savingDetails, setSavingDetails] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (!user) {
      return;
    }
    setDetailsValue({
      fullName: user.fullName,
      avatarUrl: user.avatarUrl ?? ""
    });
  }, [user]);

  const summaryUser = useMemo(
    () =>
      user
        ? {
            ...user,
            fullName: detailsValue.fullName || user.fullName,
            avatarUrl: detailsValue.avatarUrl || user.avatarUrl
          }
        : null,
    [detailsValue.avatarUrl, detailsValue.fullName, user]
  );

  async function handleDetailsSubmit() {
    const nextErrors = validateProfile(detailsValue);
    setDetailsErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setDetailsStatus({
        tone: "warning",
        title: t("auth.profile.details.validation.title", "Check your profile details"),
        description: t(
          "auth.profile.details.validation.description",
          "The profile name is required before the update can be saved."
        )
      });
      return;
    }

    setSavingDetails(true);
    setDetailsStatus({
      tone: "info",
      title: t("auth.profile.details.progress.title", "Saving profile"),
      description: t(
        "auth.profile.details.progress.description",
        "Your updated details will appear across the admin workspace."
      )
    });

    try {
      const payload = await fetchAdminAuthJson<ProfileResponse>("/api/admin/auth/profile", {
        method: "PATCH",
        body: JSON.stringify(detailsValue)
      });
      applyProfileUpdate(payload.user);
      setDetailsStatus({
        tone: "success",
        title: t("auth.profile.details.success.title", "Profile updated"),
        description: t(
          "auth.profile.details.success.description",
          "Your sidebar card and account summary now show the latest details."
        )
      });
    } catch (error) {
      setDetailsStatus({
        tone: "danger",
        title: t("auth.profile.details.error.title", "Profile update failed"),
        description: error instanceof Error ? error.message : "Try again in a moment."
      });
    } finally {
      setSavingDetails(false);
    }
  }

  async function handlePasswordSubmit() {
    const nextErrors = validatePassword(passwordValue);
    setPasswordErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setPasswordStatus({
        tone: "warning",
        title: t("auth.profile.password.validation.title", "Check your password details"),
        description: t(
          "auth.profile.password.validation.description",
          "Provide your current password and a new password with at least 10 characters."
        )
      });
      return;
    }

    setSavingPassword(true);
    setPasswordStatus({
      tone: "info",
      title: t("auth.profile.password.progress.title", "Updating password"),
      description: t(
        "auth.profile.password.progress.description",
        "Your credentials are being updated securely."
      )
    });

    try {
      await fetchAdminAuthJson("/api/admin/auth/change-password", {
        method: "POST",
        body: JSON.stringify(passwordValue)
      });
      setPasswordValue({ currentPassword: "", newPassword: "" });
      setPasswordStatus({
        tone: "success",
        title: t("auth.profile.password.success.title", "Password updated"),
        description: t(
          "auth.profile.password.success.description",
          "Use the new password the next time you sign in."
        )
      });
    } catch (error) {
      setPasswordStatus({
        tone: "danger",
        title: t("auth.profile.password.error.title", "Password update failed"),
        description: error instanceof Error ? error.message : "Try again in a moment."
      });
    } finally {
      setSavingPassword(false);
    }
  }

  async function handleSignOut() {
    setSigningOut(true);
    await signOut();
    router.replace("/login");
  }

  if (!summaryUser) {
    return null;
  }

  return (
    <main className="admin-dashboard-page">
      <SectionHeader
        title={t("auth.profile.title", "Profile")}
        description={t(
          "auth.profile.description",
          "Manage your identity details, password, and account access from one dedicated workspace."
        )}
        actions={
          <Button variant="ghost" loading={signingOut} onClick={() => void handleSignOut()}>
            {signingOut ? t("auth.profile.signOut.loading", "Signing out...") : t("auth.profile.signOut.label", "Sign out")}
          </Button>
        }
      />

      <div className="profile-page__grid">
        <ProfileSummaryCard
          user={{
            fullName: summaryUser.fullName,
            email: summaryUser.email,
            role: summaryUser.role,
            ...(summaryUser.avatarUrl ? { avatarUrl: summaryUser.avatarUrl } : {}),
            lastLoginAt: formatTimestamp(
              summaryUser.lastLoginAt,
              t("auth.profile.lastSignIn.empty", "Not available yet")
            )
          }}
          roleLabel={t("auth.profile.summary.role", "Role")}
          lastSignInLabel={t("auth.profile.summary.lastSignIn", "Last sign-in")}
          noLastSignInText={t("auth.profile.lastSignIn.empty", "Not available yet")}
        />

        <ProfileDetailsForm
          title={t("auth.profile.details.title", "Profile details")}
          description={t(
            "auth.profile.details.description",
            "Update the name and optional avatar shown in the admin shell."
          )}
          fullNameLabel={t("auth.profile.details.fullName.label", "Full name")}
          fullNameHint={t(
            "auth.profile.details.fullName.hint",
            "This appears in the sidebar profile card and account summary."
          )}
          avatarUrlLabel={t("auth.profile.details.avatar.label", "Avatar image URL")}
          avatarUrlHint={t(
            "auth.profile.details.avatar.hint",
            "Optional image. Leave blank if you prefer initials."
          )}
          saveLabel={t("auth.profile.details.save", "Save profile")}
          loadingLabel={t("auth.profile.details.loading", "Saving...")}
          value={detailsValue}
          errors={detailsErrors}
          status={detailsStatus}
          saving={savingDetails}
          onChange={setDetailsValue}
          onSubmit={() => {
            void handleDetailsSubmit();
          }}
        />

        <ProfilePasswordForm
          title={t("auth.profile.password.title", "Change password")}
          description={t(
            "auth.profile.password.description",
            "Rotate your password without leaving the profile workspace."
          )}
          currentPasswordLabel={t("auth.profile.password.current.label", "Current password")}
          currentPasswordHint={t(
            "auth.profile.password.current.hint",
            "Enter the password you use today."
          )}
          newPasswordLabel={t("auth.profile.password.new.label", "New password")}
          newPasswordHint={t(
            "auth.profile.password.new.hint",
            "Use at least 10 characters and avoid reusing your current password."
          )}
          saveLabel={t("auth.profile.password.save", "Update password")}
          loadingLabel={t("auth.profile.password.loading", "Updating...")}
          value={passwordValue}
          errors={passwordErrors}
          status={passwordStatus}
          saving={savingPassword}
          onChange={setPasswordValue}
          onSubmit={() => {
            void handlePasswordSubmit();
          }}
        />

        <ProfileTwoFactorCard />
      </div>
    </main>
  );
}
