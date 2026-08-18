"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ProfileSidebarCard } from "../auth/ProfileSidebarCard";
import { useAdminSession } from "../auth/AdminSessionProvider";
import { useBranding } from "../branding/BrandingProvider";

type AdminShellProps = {
  children: ReactNode;
  copy?: Record<string, string>;
};

type NavItem = {
  copyKey: string;
  fallbackLabel: string;
  href: string;
  icon: ReactNode;
};

type NavSection = {
  labelKey?: string;
  labelFallback?: string;
  items: Array<NavItem>;
};

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      className="admin-shell__nav-icon"
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const OverviewIcon = (
  <Icon>
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
  </Icon>
);
const UsersIcon = (
  <Icon>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
    <path d="M16 6.2a3 3 0 0 1 0 5.6" />
    <path d="M17.5 19a5.2 5.2 0 0 0-2.3-4.1" />
  </Icon>
);
const AnalyticsIcon = (
  <Icon>
    <path d="M4 20V10" />
    <path d="M10 20V4" />
    <path d="M16 20v-7" />
    <path d="M21 20H3" />
  </Icon>
);
const ContentIcon = (
  <Icon>
    <path d="M5 4h9l5 5v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z" />
    <path d="M14 4v5h5" />
    <path d="M8.5 13h7M8.5 16.5h7" />
  </Icon>
);
const SettingsIcon = (
  <Icon>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2.8v2.4M12 18.8v2.4M21.2 12h-2.4M5.2 12H2.8M18.4 5.6l-1.7 1.7M7.3 16.7l-1.7 1.7M18.4 18.4l-1.7-1.7M7.3 7.3 5.6 5.6" />
  </Icon>
);
const RewardsIcon = (
  <Icon>
    <rect x="3.5" y="8.5" width="17" height="5" rx="1" />
    <path d="M5 13.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-6.5" />
    <path d="M12 8.5V21" />
    <path d="M12 8.5C12 6 10.5 4 8.5 4S6 6 8 7.2c1.3.8 4 1.3 4 1.3ZM12 8.5C12 6 13.5 4 15.5 4S18 6 16 7.2c-1.3.8-4 1.3-4 1.3Z" />
  </Icon>
);
const CertificatesIcon = (
  <Icon>
    <circle cx="12" cy="9.5" r="5.5" />
    <path d="M9.5 9.5l1.8 1.8 3.2-3.4" />
    <path d="M9 14.6 7.5 21l4.5-2.3L16.5 21 15 14.6" />
  </Icon>
);
const ReportsIcon = (
  <Icon>
    <path d="M6 3h8l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
    <path d="M14 3v4h4" />
    <path d="M9 17v-3M12 17v-5M15 17v-2" />
  </Icon>
);

const navSections: Array<NavSection> = [
  {
    items: [{ copyKey: "nav.overview", fallbackLabel: "Overview", href: "/dashboard", icon: OverviewIcon }]
  },
  {
    labelKey: "nav.section.engagement",
    labelFallback: "Engagement",
    items: [
      { copyKey: "nav.users", fallbackLabel: "Users", href: "/users", icon: UsersIcon },
      { copyKey: "nav.analytics", fallbackLabel: "Analytics", href: "/analytics", icon: AnalyticsIcon },
      { copyKey: "nav.content", fallbackLabel: "Content", href: "/content", icon: ContentIcon }
    ]
  },
  {
    labelKey: "nav.section.operations",
    labelFallback: "Operations",
    items: [
      { copyKey: "nav.rewards", fallbackLabel: "Rewards", href: "/rewards", icon: RewardsIcon },
      { copyKey: "nav.reports", fallbackLabel: "Reports", href: "/reports", icon: ReportsIcon },
      {
        copyKey: "nav.certificates",
        fallbackLabel: "Certificates",
        href: "/certificates",
        icon: CertificatesIcon
      }
    ]
  },
  {
    labelKey: "nav.section.configuration",
    labelFallback: "Configuration",
    items: [{ copyKey: "nav.settings", fallbackLabel: "Settings", href: "/settings", icon: SettingsIcon }]
  }
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

function brandInitials(brand: string) {
  const parts = brand.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "ST";
  if (parts.length === 1) return (parts[0] ?? "S").slice(0, 2).toUpperCase();
  return `${parts[0]?.[0] ?? "S"}${parts[1]?.[0] ?? "T"}`.toUpperCase();
}

export function AdminShell({ children, copy = {} }: AdminShellProps) {
  const pathname = usePathname();
  const { status, user } = useAdminSession();
  const branding = useBranding();
  // Organisation name is driven by Settings → Branding (single source of truth),
  // not the shell.brand copy key - so renaming in Branding updates the sidebar.
  const brand = branding.organisationName;

  return (
    <div className="admin-shell">
      <aside
        className="admin-shell__sidebar"
        aria-label={resolveCopy(copy, "shell.navigationSidebar", "Admin navigation sidebar")}
      >
        <div className="admin-shell__brand">
          <span className="admin-shell__brand-mark" aria-hidden="true">
            {brandInitials(brand)}
          </span>
          <span className="admin-shell__brand-text">
            <span className="admin-shell__brand-name">{brand}</span>
            <span className="admin-shell__brand-sub">
              {resolveCopy(copy, "shell.brandSubtitle", "Admin Console")}
            </span>
          </span>
        </div>

        <nav
          className="admin-shell__nav"
          aria-label={resolveCopy(copy, "shell.navigation", "Admin navigation")}
        >
          {navSections.map((section, index) => (
            <div className="admin-shell__nav-section" key={section.labelKey ?? `section-${index}`}>
              {section.labelKey ? (
                <p className="admin-shell__nav-section-label">
                  {resolveCopy(copy, section.labelKey, section.labelFallback ?? "")}
                </p>
              ) : null}
              {section.items.map((item) => {
                const active = isActivePath(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    suppressHydrationWarning
                    aria-current={active ? "page" : undefined}
                    className={`admin-shell__nav-link ${active ? "admin-shell__nav-link--active" : ""}`}
                  >
                    <span className="admin-shell__nav-link-rail" aria-hidden="true" />
                    {item.icon}
                    <span className="admin-shell__nav-link-label">
                      {resolveCopy(copy, item.copyKey, item.fallbackLabel)}
                    </span>
                  </Link>
                );
              })}
            </div>
          ))}
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
