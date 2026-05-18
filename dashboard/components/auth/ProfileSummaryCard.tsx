import { Badge, Card } from "../ui";
import type { AdminProfileUser } from "./types";

export type ProfileSummaryCardProps = {
  user: AdminProfileUser;
  roleLabel: string;
  lastSignInLabel: string;
  noLastSignInText: string;
};

function getInitials(name: string) {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (!parts.length) {
    return "ST";
  }
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
}

export function ProfileSummaryCard({
  user,
  roleLabel,
  lastSignInLabel,
  noLastSignInText
}: ProfileSummaryCardProps) {
  return (
    <Card>
      <section className="profile-summary-card">
        <div className="profile-summary-card__identity">
          <div className="profile-summary-card__avatar" aria-hidden="true">
            {user.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.avatarUrl} alt="" className="profile-summary-card__avatar-image" />
            ) : (
              <span className="profile-summary-card__avatar-fallback">{getInitials(user.fullName)}</span>
            )}
          </div>
          <div>
            <h3 className="profile-summary-card__name">{user.fullName}</h3>
            <p className="profile-summary-card__email">{user.email}</p>
          </div>
        </div>

        <div className="profile-summary-card__meta">
          <div className="profile-summary-card__meta-item">
            <span className="profile-summary-card__meta-label">{roleLabel}</span>
            <Badge variant="neutral">{user.role}</Badge>
          </div>
          <div className="profile-summary-card__meta-item">
            <span className="profile-summary-card__meta-label">{lastSignInLabel}</span>
            <span className="profile-summary-card__meta-value">
              {user.lastLoginAt ? user.lastLoginAt : noLastSignInText}
            </span>
          </div>
        </div>
      </section>
    </Card>
  );
}
