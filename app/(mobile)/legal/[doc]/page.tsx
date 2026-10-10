import { notFound } from "next/navigation";
import { PageShell } from "@/components/ui";

// C20 stubs: the texts are written by Aaron (CDC 9.8) and will replace the placeholder.
const TITLES: Record<string, string> = {
  terms: "Terms of use",
  risk: "Risk warning",
  recovery: "Recovery terms",
  privacy: "Privacy policy",
  cookies: "Cookies",
  legal: "Legal notice",
};

export function generateStaticParams() {
  return Object.keys(TITLES).map((doc) => ({ doc }));
}

export const dynamicParams = false;

export default async function LegalPage({ params }: { params: Promise<{ doc: string }> }) {
  const { doc } = await params;
  const title = TITLES[doc];
  if (!title) notFound();
  return (
    <PageShell title={title} backHref="/documents">
      <p className="text-base leading-6 text-muted">This text is being written. It will appear here before the demo.</p>
    </PageShell>
  );
}
