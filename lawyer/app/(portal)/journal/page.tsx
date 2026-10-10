import { EmptyState } from "@/components/ui";

export default function JournalPage() {
  return (
    <>
      <h1 className="text-[28px] font-semibold leading-9 text-ink">Journal</h1>
      <EmptyState title="No journal entries yet." className="mt-6 rounded-card border border-line bg-white" />
    </>
  );
}
