"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDownLeft, ArrowUpRight, History, House, KeyRound, Landmark, Shield, Smartphone, ArrowUpDown } from "lucide-react";
import { getActivity, getBalance } from "@/lib/sqkeys";
import type { Account, ActivityItem, TxStatus } from "@/lib/sqkeys";
import { Banner, Button, CoinIcon, CopyField, HeroCard, PageShell, RowCard, StatusChip, TabBar } from "@/components/ui";
import type { ChipStatus } from "@/components/ui/StatusChip";
import { Guard } from "../_lib/Guard";
import { isNotAuthenticated, messageOf } from "../_lib/errors";
import { SESSION_KEYS, readSession } from "../_lib/session";

const TABS = [
  { id: "home", label: "Home", icon: <House size={22} strokeWidth={1.75} />, href: "/home" },
  { id: "activity", label: "Activity", icon: <History size={22} strokeWidth={1.75} />, href: "/activity" },
  { id: "transfer", label: "Send", icon: <ArrowUpDown size={22} strokeWidth={1.75} />, href: "/send" },
  { id: "security", label: "Security", icon: <Shield size={22} strokeWidth={1.75} />, href: "/security" },
];

const chipFor = (status: TxStatus | undefined): ChipStatus | null => {
  if (!status || status === "confirmed") return null;
  if (status === "refused" || status === "failed" || status === "expired" || status === "cancelled") return "failed";
  return "pending";
};

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function SectionHeader({ title, href, link }: { title: string; href: string; link: string }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-[22px] font-semibold leading-7 text-ink">{title}</h2>
      <Link href={href} className="flex min-h-11 items-center px-1 text-sm font-medium text-muted">{link}</Link>
    </div>
  );
}

function ActivityRow({ item }: { item: ActivityItem }) {
  const chip = chipFor(item.status);
  const sign = item.kind === "transfer_in" ? "+" : item.kind === "transfer_out" ? "-" : "";
  const leading: ReactNode =
    item.kind === "security" ? <Shield size={20} strokeWidth={1.75} /> : <CoinIcon coin="usdc" size={40} />;
  return (
    <RowCard
      leading={leading}
      title={item.title}
      subtitle={when(item.at)}
      trailing={
        chip ? (
          <StatusChip status={chip} />
        ) : item.amountUsdc ? (
          <span className="text-base font-semibold text-ink">{`${sign}${item.amountUsdc} USDC`}</span>
        ) : undefined
      }
    />
  );
}

// C7. Texts: annex F.2.
function Home({ account }: { account: Account }) {
  const router = useRouter();
  const [balance, setBalance] = useState<string | null>(null);
  const [activity, setActivity] = useState<ActivityItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name] = useState(() => readSession<string>(SESSION_KEYS.displayName, "").split(" ")[0]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [b, a] = await Promise.all([getBalance(), getActivity()]);
      setBalance(b.usdc);
      setActivity(a);
    } catch (e) {
      if (isNotAuthenticated(e)) return router.replace("/login");
      setError(messageOf(e));
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  const pending = activity?.filter((a) => a.status === "pending_lawyer").length ?? 0;
  const phone = account.devices.find((d) => d.current) ?? account.devices[0];
  const lawyerOk = account.lawyer.status === "accepted";

  return (
    <PageShell tabBar={<TabBar items={TABS} activeId="home" />}>
      <h1 className="sr-only">Home{name ? `, ${name}` : ""}</h1>

      {account.recovery && (
        <Banner
          variant="warning"
          className="mb-4"
          action={<Button variant="secondary" className="min-h-11 text-base" onClick={() => router.push(`/recovery/${account.recovery?.id}`)}>Cancel recovery</Button>}
        >
          A recovery was requested for your wallet. If this wasn&apos;t you, cancel it now.
        </Banner>
      )}
      {pending > 0 && (
        <Banner variant="info" className="mb-4" action={<Button variant="secondary" className="min-h-11 text-base" onClick={() => router.push("/activity")}>View</Button>}>
          Waiting for your lawyer: {pending === 1 ? "1 request is" : `${pending} requests are`} pending.
        </Banner>
      )}
      {error && (
        <Banner variant="warning" className="mb-4" action={<Button variant="secondary" className="min-h-11 text-base" onClick={load}>Try again</Button>}>
          {error}
        </Banner>
      )}

      <HeroCard label="Balance" amount={balance ?? "…"} />
      <p className="mt-3 text-center text-sm text-muted">Network fees are paid by Swissquote.</p>

      {account.address && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-card bg-surface px-4 py-3">
          <span className="text-sm text-muted">Your wallet</span>
          <CopyField value={account.address} label="Copy wallet address" />
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Button variant="secondary" icon={<ArrowUpRight size={24} strokeWidth={1.75} />} onClick={() => router.push("/send")}>Send</Button>
        <Button variant="secondary" icon={<ArrowDownLeft size={24} strokeWidth={1.75} />} onClick={() => router.push("/receive")}>Receive</Button>
        <Button variant="secondary" className="col-span-2" icon={<Landmark size={24} strokeWidth={1.75} />} onClick={() => router.push("/from-swissquote")}>From Swissquote</Button>
      </div>

      <section className="mt-8">
        <SectionHeader title="Account security" href="/security" link="Manage" />
        <div className="flex flex-col gap-3">
          <RowCard leading={<Smartphone size={20} strokeWidth={1.75} />} title="Phone key" subtitle={phone?.label} trailing={<StatusChip status="verified" />} />
          <RowCard
            leading={<KeyRound size={20} strokeWidth={1.75} />}
            title="Your lawyer"
            subtitle={lawyerOk ? "Accepted" : "Waiting for your lawyer…"}
            trailing={<StatusChip status={lawyerOk ? "verified" : "pending"} />}
          />
        </div>
      </section>

      <section className="mt-8">
        <SectionHeader title="Recent activity" href="/activity" link="View all" />
        <div className="flex flex-col gap-3">
          {activity === null && !error && <p className="text-base text-muted">Loading…</p>}
          {activity?.length === 0 && <p className="text-base text-muted">No activity yet.</p>}
          {activity?.slice(0, 3).map((item) => <ActivityRow key={item.id} item={item} />)}
        </div>
      </section>
    </PageShell>
  );
}

export default function HomePage() {
  return <Guard route="/home">{(account) => <Home account={account} />}</Guard>;
}
