"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { ToastProvider } from "@/components/ui";
import { useRouter } from "next/navigation";
import { LawyerApiError, getMe } from "@/lib/lawyerApi";
import { MobileTabBar } from "./MobileTabBar";
import { Sidebar } from "./Sidebar";
import { SimulatedStrip } from "./SimulatedStrip";
import { TopBar } from "./TopBar";

/** Strip, sidebar, top bar and mobile tab bar around the portal pages. Loads the lawyer's name once. */
export function PortalChrome({ children }: { children: ReactNode }) {
  const [name, setName] = useState("Lawyer");
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    getMe().then(
      (me) => {
        if (!cancelled) setName(me.displayName);
      },
      (e) => {
        // No session (live mode): go to the passkey sign-in. Other errors keep the neutral label; the pages show their own.
        if (e instanceof LawyerApiError && e.code === "NOT_SIGNED_IN") router.replace("/login");
      },
    );
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <ToastProvider>
      <SimulatedStrip />
      <div className="flex">
        <Sidebar lawyerName={name} />
        <div className="min-w-0 flex-1">
          <TopBar lawyerName={name} />
          <main className="mx-auto max-w-[1100px] px-4 pb-28 pt-6 md:px-6 md:pb-10">{children}</main>
        </div>
      </div>
      <MobileTabBar />
    </ToastProvider>
  );
}
