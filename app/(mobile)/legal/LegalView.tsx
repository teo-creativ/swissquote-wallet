"use client";

import { useRouter } from "next/navigation";
import { PageShell } from "@/components/ui";
import { Markdown } from "./Markdown";

/** Back goes to where the reader came from (documents screen, security, footer), /security if there is no history. */
export function LegalView({ title, source }: { title: string; source: string }) {
  const router = useRouter();
  return (
    <PageShell title={title} onBack={() => (window.history.length > 1 ? router.back() : router.push("/security"))}>
      <Markdown source={source} />
    </PageShell>
  );
}
