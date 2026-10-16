import { FolderKanban, Trophy, BarChart3, BookOpenCheck, LayoutDashboard, ListChecks, RotateCcw, Settings, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/problems", label: "All Problems", icon: ListChecks },
  { href: "/projects", label: "Weekly Projects", icon: FolderKanban },
  { href: "/topics", label: "Topics", icon: BookOpenCheck },
  { href: "/revision", label: "Revision", icon: RotateCcw },
  { href: "/milestones", label: "Milestones", icon: Trophy },
  { href: "/stats", label: "Statistics & Analytics", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
