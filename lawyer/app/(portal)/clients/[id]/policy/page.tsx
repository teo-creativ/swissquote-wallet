import { PolicyView } from "@/components/portal/PolicyView";

export const metadata = { title: "Client policy · SQ Keys Lawyer" };

export default async function PolicyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PolicyView clientId={decodeURIComponent(id)} />;
}
