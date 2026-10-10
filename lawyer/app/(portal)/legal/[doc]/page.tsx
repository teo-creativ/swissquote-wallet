import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Banner, Card, StatusChip } from "@/components/ui";
import { Breadcrumb } from "@/components/portal/detailParts";
import { Markdown } from "@/components/portal/Markdown";
import { LEGAL_DOCS, findLegalDoc } from "@/lib/legal";

export function generateStaticParams() {
  return LEGAL_DOCS.map((d) => ({ doc: d.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ doc: string }> }): Promise<Metadata> {
  const doc = findLegalDoc((await params).doc);
  return { title: doc ? `${doc.title} · SQ Keys Lawyer` : "Legal · SQ Keys Lawyer" };
}

/** L10. Markdown placeholders, every page marked Draft. */
export default async function LegalDocPage({ params }: { params: Promise<{ doc: string }> }) {
  const doc = findLegalDoc((await params).doc);
  if (!doc) notFound();
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Breadcrumb current={doc.title} parent={{ label: "Legal", href: "/legal" }} />
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-[28px] font-semibold leading-9 text-ink">{doc.title}</h1>
          <StatusChip status="warning">Draft</StatusChip>
        </div>
      </div>
      <Banner variant="warning">Draft. This text is a placeholder and has not been reviewed by a lawyer.</Banner>
      <Card>
        <Markdown source={doc.body} />
      </Card>
    </div>
  );
}
