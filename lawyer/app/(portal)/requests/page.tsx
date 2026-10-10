import { EmptyState } from "@/components/ui";

export default function RequestsPage() {
  return (
    <>
      <h1 className="text-[28px] font-semibold leading-9 text-ink">Requests</h1>
      <EmptyState className="mt-6 rounded-card border border-line bg-white" />
    </>
  );
}
