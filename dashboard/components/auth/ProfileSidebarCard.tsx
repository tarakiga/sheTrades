"use client";

import Link from "next/link";
import type { AdminProfileUser } from "./types";

export type ProfileSidebarCardProps = {
  user: AdminProfileUser;
  href: string;
  label: string;
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

export function ProfileSidebarCard({ user, href, label }: ProfileSidebarCardProps) {
  return (
    <Link href={href} className="profile-sidebar-card" aria-label={label}>
      <div className="profile-sidebar-card__avatar" aria-hidden="true">
        {user.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.avatarUrl} alt="" className="profile-sidebar-card__avatar-image" />
        ) : (
          <span className="profile-sidebar-card__avatar-fallback">{getInitials(user.fullName)}</span>
        )}
      </div>
      <div className="profile-sidebar-card__copy">
        <p className="profile-sidebar-card__name">{user.fullName}</p>
        <p className="profile-sidebar-card__email">{user.email}</p>
      </div>
    </Link>
  );
}
