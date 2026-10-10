import { AuthScreen } from "@/components/portal/AuthCard";

// Screens shown before there is a session: L1 invitation, L2 account, L3 login.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <AuthScreen>{children}</AuthScreen>;
}
