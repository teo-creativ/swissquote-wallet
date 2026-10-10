import { InviteIntro } from "@/components/portal/InviteIntro";

export const metadata = { title: "Invitation · SQ Keys Lawyer" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <InviteIntro token={decodeURIComponent(token)} />;
}
