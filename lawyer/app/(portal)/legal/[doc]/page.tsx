import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui";
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

/** L10. Markdown legal text (lib/legal.ts). */
export default async function LegalDocPage({ params }: { params: Promise<{ doc: string }> }) {
  const doc = findLegalDoc((await params).doc);
  if (!doc) notFound();
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Breadcrumb current={doc.title} parent={{ label: "Legal", href: "/legal" }} />
        <h1 className="mt-1 text-[28px] font-semibold leading-9 text-ink">{doc.title}</h1>
      </div>
      <Card>
        <Markdown source={doc.body} />
      </Card>
    </div>
  );
}
