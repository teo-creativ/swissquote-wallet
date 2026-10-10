import { RequestDetailView } from "@/components/portal/RequestDetailView";

export const metadata = { title: "Request · SQ Keys Lawyer" };

export default async function RequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RequestDetailView id={decodeURIComponent(id)} />;
}
