"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { ArrowDownLeft, ArrowUpRight, ChevronRight, History, House, QrCode, Share2, Shield, User, ArrowUpDown, KeyRound, Smartphone } from "lucide-react";
import {
  Banner,
  BottomSheet,
  Button,
  CheckHalo,
  CoinIcon,
  HeroCard,
  IconButton,
  Input,
  KeyShowcase,
  Logo,
  PageShell,
  ReviewItem,
  RowCard,
  SimulatedPill,
  Spinner,
  StatusChip,
  StepList,
  TabBar,
} from "@/components/ui";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="mb-4 text-[22px] font-semibold leading-7 text-ink">{title}</h2>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}

function Caption({ children }: { children: ReactNode }) {
  return <p className="-mb-2 text-xs font-medium uppercase tracking-wide text-muted">{children}</p>;
}

const tabs = [
  { id: "home", label: "Home", icon: <House size={22} strokeWidth={1.75} /> },
  { id: "history", label: "History", icon: <History size={22} strokeWidth={1.75} /> },
  { id: "transfer", label: "Transfer", icon: <ArrowUpDown size={22} strokeWidth={1.75} /> },
  { id: "security", label: "Security", icon: <Shield size={22} strokeWidth={1.75} /> },
];

export function UiShowcase() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [tab, setTab] = useState("home");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);

  function fakeLoad() {
    setLoading(true);
    setTimeout(() => setLoading(false), 1800);
  }

  return (
    <PageShell
      title="UI kit"
      subtitle="Every component and state, on the 390px column. Dev only."
      tabBar={<TabBar items={tabs} activeId={tab} onSelect={setTab} />}
    >
      <Section title="Button">
        <Caption>Primary, default / loading / disabled</Caption>
        <Button>Create my key</Button>
        <Button loading={loading} onClick={fakeLoad}>
          {loading ? "Creating…" : "Click to load"}
        </Button>
        <Button disabled>Accept and continue</Button>
        <Caption>With icons</Caption>
        <Button icon={<ArrowUpRight size={24} strokeWidth={1.75} />}>Send</Button>
        <Button trailingIcon={<ChevronRight size={24} strokeWidth={1.75} />}>Continue</Button>
        <Caption>Secondary</Caption>
        <Button variant="secondary">Cancel</Button>
        <Button variant="secondary" disabled>Cancel</Button>
        <Caption>Dark</Caption>
        <Button variant="dark">Copy the invitation</Button>
        <Button variant="dark" disabled>Copy the invitation</Button>
        <Caption>Ghost</Caption>
        <Button variant="ghost">I&apos;ve lost access to my wallet</Button>
        <Button variant="ghost" disabled>I&apos;ve lost access to my wallet</Button>
        <Caption>Not full width</Caption>
        <div><Button fullWidth={false}>Sign in</Button></div>
      </Section>

      <Section title="IconButton">
        <div className="flex items-center gap-3">
          <IconButton label="Scan a QR code" icon={<QrCode size={20} strokeWidth={1.75} />} />
          <IconButton label="Share" variant="dark" icon={<Share2 size={20} strokeWidth={1.75} />} />
          <IconButton label="Profile" variant="ghost" icon={<User size={20} strokeWidth={1.75} />} />
          <IconButton label="History (unavailable)" disabled icon={<History size={20} strokeWidth={1.75} />} />
        </div>
      </Section>

      <Section title="Input">
        <Input label="Amount (USDC)" placeholder="0.00" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)}
          trailing={<button type="button" onClick={() => setAmount("10")} className="h-11 rounded-pill px-4 text-sm font-semibold text-brand">MAX</button>} />
        <Input label="Recipient address" placeholder="0x…" hint="Base network only." trailing={<IconButton label="Scan a QR code" variant="ghost" icon={<QrCode size={20} strokeWidth={1.75} />} />} />
        <Input label="Your lawyer's name (optional)" defaultValue="Maître Dupont" />
        <Input label="Recipient address" defaultValue="0x12" error="Enter a valid address." />
        <Input label="Disabled" defaultValue="Locked" disabled />
      </Section>

      <Section title="StatusChip">
        <div className="flex flex-wrap gap-2">
          <StatusChip status="verified" />
          <StatusChip status="warning" />
          <StatusChip status="pending" />
          <StatusChip status="read" />
          <StatusChip status="failed" />
        </div>
        <Caption>Interactive (44px target)</Caption>
        <div><StatusChip status="read" onClick={() => undefined} /></div>
      </Section>

      <Section title="SimulatedPill">
        <div className="flex flex-wrap gap-2">
          <SimulatedPill />
          <SimulatedPill>Simulated Swissquote login</SimulatedPill>
          <SimulatedPill>Simulated identity check</SimulatedPill>
        </div>
      </Section>

      <Section title="Banner">
        <Banner variant="info">Network fees are paid by Swissquote.</Banner>
        <Banner variant="warning" title="Recovery requested" action={<Button variant="secondary" className="min-h-11 text-base">Cancel recovery</Button>}>
          A recovery was requested for your wallet. If this wasn&apos;t you, cancel it now.
        </Banner>
        <Banner variant="demo">Demo mode: recovery delay is 2 minutes. In production it would be 24 hours.</Banner>
      </Section>

      <Section title="RowCard">
        <RowCard leading={<Smartphone size={20} strokeWidth={1.75} />} title="Phone key" trailing={<StatusChip status="verified" />} />
        <RowCard leading={<KeyRound size={20} strokeWidth={1.75} />} title="Your lawyer" subtitle="Waiting for your lawyer…" trailing={<StatusChip status="pending" />} />
        <RowCard leading={<CoinIcon coin="usdc" size={40} label="USDC" />} title="To 0x1234…abcd" subtitle="Today, 14:32" trailing={<span className="text-base font-semibold">-25.00 USDC</span>} />
        <Caption>Interactive</Caption>
        <RowCard leading={<ArrowDownLeft size={20} strokeWidth={1.75} />} title="Receive" subtitle="Show your address" onClick={() => undefined} />
        <RowCard leading={<CoinIcon coin="eth" size={32} />} title="Network fee" subtitle="Paid by Swissquote" />
      </Section>

      <Section title="StepList">
        <StepList
          steps={[
            { label: "Preparing", status: "done" },
            { label: "Creating your key (nobody ever sees the whole key)", status: "active" },
            { label: "Checking the key", status: "todo" },
            { label: "Saving your part on this phone", status: "error" },
          ]}
        />
      </Section>

      <Section title="ReviewItem">
        <div>
          <ReviewItem status="verified" title="Result Overview" description="You are sending 250.00 USDC." />
          <ReviewItem status="warning" title="Address" description="New recipient: your lawyer must approve it once." />
          <ReviewItem status="verified" title="Amount" description="Below your limit." />
        </div>
      </Section>

      <Section title="CheckHalo and Spinner">
        <div className="flex items-center gap-8 px-3 py-3">
          <CheckHalo />
          <CheckHalo size={48} />
          <Spinner />
          <Spinner size={40} />
        </div>
      </Section>

      <Section title="HeroCard">
        <HeroCard
          label="Balance"
          amount="1'250.00"
          topLeft={<IconButton label="Profile" variant="ghost" icon={<User size={20} strokeWidth={1.75} />} className="bg-white/25 text-white" />}
          topRight={<IconButton label="History" variant="ghost" icon={<History size={20} strokeWidth={1.75} />} className="bg-white/25 text-white" />}
        >
          <span className="rounded-pill bg-white/25 px-4 py-1.5 text-sm font-semibold">Network fees are paid by Swissquote.</span>
        </HeroCard>
      </Section>

      <Section title="KeyShowcase">
        <KeyShowcase variant="phone" />
        <KeyShowcase variant="lawyer" />
      </Section>

      <Section title="Logo and CoinIcon">
        <Logo scale={1} />
        <Logo scale={2} withProductName />
        <div className="flex items-center gap-3">
          <CoinIcon coin="usdc" size={24} label="USDC" />
          <CoinIcon coin="usdc" size={48} label="USDC" />
          <CoinIcon coin="eth" size={32} label="ETH" />
        </div>
      </Section>

      <Section title="BottomSheet">
        <Button variant="secondary" onClick={() => setSheetOpen(true)}>Open the sheet</Button>
        <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Invite your lawyer">
          <p className="mb-4 text-base text-muted">Send this link to your lawyer. It works once and expires in 7 days.</p>
          <Input label="Link" defaultValue="https://example.test/invite/demo" readOnly />
          <div className="mt-4 flex flex-col gap-3">
            <Button variant="dark">Copy link</Button>
            <Button variant="secondary" icon={<Share2 size={24} strokeWidth={1.75} />}>Share</Button>
          </div>
        </BottomSheet>
      </Section>

      <Section title="TabBar (pinned at the bottom of this page)">
        <p className="text-sm text-muted">Active tab: {tab}</p>
      </Section>
    </PageShell>
  );
}
