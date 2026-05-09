"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

type AdminShellProps = {
  children: ReactNode;
};

type NavItem = {
  label: string;
  href: string;
};

const adminNavItems: Array<NavItem> = [
  { label: "Overview", href: "/dashboard" },
  { label: "Users", href: "/users" },
  { label: "Analytics", href: "/analytics" },
  { label: "Content", href: "/content" },
  { label: "Rewards", href: "/rewards" },
  { label: "Reports", href: "/reports" }
];

function isActivePath(pathname: string, href: string): boolean {
  if (href === "/dashboard") {
    return pathname === "/dashboard";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminShell({ children }: AdminShellProps) {
  const pathname = usePathname();

  return (
    <div className="admin-shell">
      <aside className="admin-shell__sidebar" aria-label="Admin navigation sidebar">
        <div className="admin-shell__brand">SheTrades Admin</div>
        <nav className="admin-shell__nav" aria-label="Admin navigation">
          {adminNavItems.map((item) => {
            const active = isActivePath(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`admin-shell__nav-link ${active ? "admin-shell__nav-link--active" : ""}`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="admin-shell__main">
        <header className="admin-shell__topbar">
          <p className="admin-shell__route-label">Current route: {pathname}</p>
        </header>
        <div className="admin-shell__content">{children}</div>
      </div>
    </div>
  );
}
