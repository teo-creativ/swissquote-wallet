import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Card } from "@/components/ui";
import { ConsentRecord } from "@/components/portal/ConsentRecord";
import { LEGAL_DOCS } from "@/lib/legal";

export const metadata = { title: "Legal · SQ Keys Lawyer" };

export default function LegalIndexPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-[28px] font-semibold leading-9 text-ink">Legal</h1>
      <ConsentRecord />
      <Card flush>
        <ul className="divide-y divide-line">
          {LEGAL_DOCS.map((d) => (
            <li key={d.slug}>
              <Link href={`/legal/${d.slug}`} className="flex min-h-16 items-center justify-between gap-4 px-5 py-3 md:px-6">
                <span className="min-w-0">
                  <span className="block font-medium text-ink">{d.title}</span>
                  <span className="block text-sm text-muted">{d.summary}</span>
                </span>
                <ChevronRight size={16} strokeWidth={1.75} className="shrink-0 text-muted" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
