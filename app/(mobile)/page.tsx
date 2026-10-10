"use client";

import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { Button, Logo } from "@/components/ui";

// Splash / welcome (design.md section 5). The hand illustration still has baked placeholder UI: re-export before the demo.
export default function Splash() {
  const router = useRouter();
  return (
    <div className="flex min-h-dvh flex-col bg-gradient-to-b from-white via-white to-hero-top">
      <main className="px-4 pt-8">
        <Logo scale={1.5} withProductName />
        <h1 className="mt-10 text-[40px] font-semibold leading-[44px] text-ink">Your cryptos, your keys.</h1>
        <p className="mt-4 text-base leading-6 text-muted">
          Take control of your digital assets. Your lawyer and Swissquote can never move them alone.
        </p>
        <Button className="mt-6" trailingIcon={<ChevronRight size={24} strokeWidth={1.75} />} onClick={() => router.push("/login")}>
          Get started
        </Button>
      </main>
      <div className="mt-auto flex justify-center">
        <img src="/illustrations/hand-phone.png" alt="" width={390} height={497} className="h-auto w-full max-w-[390px]" />
      </div>
    </div>
  );
}
