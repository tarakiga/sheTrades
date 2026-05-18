export type AuthStatusTone = "info" | "success" | "warning" | "danger";

export type AuthStatusMessage = {
  tone: AuthStatusTone;
  title: string;
  description?: string;
};

export type AdminProfileUser = {
  fullName: string;
  email: string;
  role: string;
  avatarUrl?: string;
  lastLoginAt?: string | null;
};
