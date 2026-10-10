import { LayoutDashboard, Inbox, Users, ScrollText } from "lucide-react";
import type { ReactNode } from "react";

export type NavItem = { href: string; label: string; icon: ReactNode };

/** Portal sections (design.md section 1). Legal pages (L10) live in the footer, not here. */
export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: <LayoutDashboard size={20} strokeWidth={1.75} /> },
  { href: "/requests", label: "Requests", icon: <Inbox size={20} strokeWidth={1.75} /> },
  { href: "/clients", label: "Clients", icon: <Users size={20} strokeWidth={1.75} /> },
  { href: "/journal", label: "Journal", icon: <ScrollText size={20} strokeWidth={1.75} /> },
];

export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
