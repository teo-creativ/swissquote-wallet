import { EmptyState } from "@/components/ui";

export default function ClientsPage() {
  return (
    <>
      <h1 className="text-[28px] font-semibold leading-9 text-ink">Clients</h1>
      <EmptyState title="No clients yet." className="mt-6 rounded-card border border-line bg-white" />
    </>
  );
}
