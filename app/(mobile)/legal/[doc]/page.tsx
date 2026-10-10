import { readFile } from "node:fs/promises";
import path from "node:path";
import { notFound } from "next/navigation";
import { LegalView } from "../LegalView";

// C20. The texts live in content/legal/*.md (final wording: Aaron, CDC 9.8). Read at build time.
const LEGAL_DOCS: Record<string, string> = {
  terms: "Terms of use",
  risk: "Risk warning",
  recovery: "Recovery terms",
  privacy: "Privacy policy",
  cookies: "Cookies",
  notice: "Legal notice",
};

export function generateStaticParams() {
  return Object.keys(LEGAL_DOCS).map((doc) => ({ doc }));
}

export const dynamicParams = false;

export default async function LegalPage({ params }: { params: Promise<{ doc: string }> }) {
  const { doc } = await params;
  const title = LEGAL_DOCS[doc];
  if (!title) notFound();
  const source = await readFile(path.join(process.cwd(), "content", "legal", `${doc}.md`), "utf8");
  return <LegalView title={title} source={source} />;
}
