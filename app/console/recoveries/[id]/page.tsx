import { notFound } from "next/navigation";
import { getRecovery, listClients } from "@/lib/console.data";
import { RecoveryDetail } from "./RecoveryDetail";

export default async function RecoveryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const recovery = await getRecovery(id);
  if (!recovery) notFound();
  const client = (await listClients()).find((c) => c.id === recovery.clientId);
  if (!client) notFound();
  return <RecoveryDetail initialRecovery={recovery} initialClient={client} serverNow={Date.now()} />;
}
