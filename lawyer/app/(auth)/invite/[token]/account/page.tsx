import { AccountForm } from "@/components/portal/AccountForm";

export const metadata = { title: "Create your account · SQ Keys Lawyer" };

export default async function AccountPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <AccountForm token={decodeURIComponent(token)} />;
}
