"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ProfileSidebarCard } from "../auth/ProfileSidebarCard";
import { useAdminSession } from "../auth/AdminSessionProvider";

type AdminShellProps = {
  children: ReactNode;
  copy?: Record<string, string>;
};

type NavItem = {
  copyKey: string;
  fallbackLabel: string;
  href: string;
};

const adminNavItems: Array<NavItem> = [
  { copyKey: "nav.overview", fallbackLabel: "Overview", href: "/dashboard" },
  { copyKey: "nav.users", fallbackLabel: "Users", href: "/users" },
  { copyKey: "nav.analytics", fallbackLabel: "Analytics", href: "/analytics" },
  { copyKey: "nav.content", fallbackLabel: "Content", href: "/content" },
  { copyKey: "nav.settings", fallbackLabel: "Settings", href: "/settings" },
  { copyKey: "nav.rewards", fallbackLabel: "Rewards", href: "/rewards" },
  { copyKey: "nav.reports", fallbackLabel: "Reports", href: "/reports" }
];

function isActivePath(pathname: string, href: string): boolean {
  if (href === "/dashboard") {
    return pathname === "/dashboard";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function resolveCopy(copy: Record<string, string>, key: string, fallback: string) {
  const value = copy[key];
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

export function AdminShell({ children, copy = {} }: AdminShellProps) {
  const pathname = usePathname();
  const { status, user } = useAdminSession();

  return (
    <div className="admin-shell">
      <aside
        className="admin-shell__sidebar"
        aria-label={resolveCopy(copy, "shell.navigationSidebar", "Admin navigation sidebar")}
      >
        <div className="admin-shell__brand">
          {resolveCopy(copy, "shell.brand", "SheTrades Admin")}
        </div>
        <nav
          className="admin-shell__nav"
          aria-label={resolveCopy(copy, "shell.navigation", "Admin navigation")}
        >
          {adminNavItems.map((item) => {
            const active = isActivePath(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                suppressHydrationWarning
                className={`admin-shell__nav-link ${active ? "admin-shell__nav-link--active" : ""}`}
              >
                {resolveCopy(copy, item.copyKey, item.fallbackLabel)}
              </Link>
            );
          })}
        </nav>
        <div className="admin-shell__sidebar-footer">
          {status === "authenticated" && user ? (
            <ProfileSidebarCard
              user={{
                fullName: user.fullName,
                email: user.email,
                role: user.role,
                ...(user.avatarUrl ? { avatarUrl: user.avatarUrl } : {}),
                ...(user.lastLoginAt ? { lastLoginAt: user.lastLoginAt } : {})
              }}
              href="/profile"
              label={resolveCopy(copy, "auth.profile.sidebar", "Open profile")}
            />
          ) : (
            <div className="admin-shell__sidebar-status">
              {resolveCopy(copy, "auth.profile.sidebar.loading", "Preparing your account panel")}
            </div>
          )}
        </div>
      </aside>

      <div className="admin-shell__main">
        <header className="admin-shell__topbar">
          <p className="admin-shell__route-label">
            {resolveCopy(copy, "shell.currentRoute", "Current route")}: {pathname}
          </p>
        </header>
        <div className="admin-shell__content">{children}</div>
      </div>
    </div>
  );
}
