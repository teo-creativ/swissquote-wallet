import type { Metadata } from "next";
import { UiShowcase } from "./UiShowcase";

// Dev showcase of components/ui. Not linked from any navigation, not indexed.
export const metadata: Metadata = { title: "UI kit · SQ Keys", robots: { index: false, follow: false } };

export default function UiShowcasePage() {
  return <UiShowcase />;
}
