import { ArrowUpDown, History, House, Shield } from "lucide-react";
import { TabBar } from "@/components/ui";

const TABS = [
  { id: "home", label: "Home", icon: <House size={22} strokeWidth={1.75} />, href: "/home" },
  { id: "activity", label: "Activity", icon: <History size={22} strokeWidth={1.75} />, href: "/activity" },
  { id: "transfer", label: "Send", icon: <ArrowUpDown size={22} strokeWidth={1.75} />, href: "/send" },
  { id: "security", label: "Security", icon: <Shield size={22} strokeWidth={1.75} />, href: "/security" },
];

export function AppTabBar({ active }: { active: "home" | "activity" | "transfer" | "security" }) {
  return <TabBar items={TABS} activeId={active} />;
}
