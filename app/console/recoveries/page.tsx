import { listClients, listRecoveries } from "@/lib/console.data";
import { PageTitle } from "../PageTitle";
import { RecoveriesTable } from "./RecoveriesTable";

export default async function RecoveriesPage() {
  const [recoveries, clients] = await Promise.all([listRecoveries(), listClients()]);
  return (
    <>
      <PageTitle title="Recoveries" count={`${recoveries.length} requests`} />
      <RecoveriesTable recoveries={recoveries} clients={clients} serverNow={Date.now()} />
    </>
  );
}
