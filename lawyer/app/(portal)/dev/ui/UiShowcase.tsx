"use client";

import Link from "next/link";
import { useState } from "react";
import type { ReactNode } from "react";
import { Inbox, Lock, ShieldCheck } from "lucide-react";
import {
  Banner,
  Button,
  Card,
  CopyField,
  Countdown,
  Dialog,
  EmptyState,
  Input,
  SimulatedPill,
  Stat,
  StatusChip,
  Table,
} from "@/components/ui";
import type { TableColumn } from "@/components/ui";

type Row = { id: string; client: string; type: string; amount: string; status: "pending" | "approved" | "refused" | "expired"; age: string };

// Demo data only: obviously fake names, no real address.
const ROWS: Row[] = [
  { id: "1", client: "Client A", type: "Transfer", amount: "120.00 USDC", status: "pending", age: "3 min" },
  { id: "2", client: "Client B", type: "Recovery", amount: "-", status: "approved", age: "2 h" },
  { id: "3", client: "Client A", type: "Transfer", amount: "45.50 USDC", status: "refused", age: "1 day" },
  { id: "4", client: "Client C", type: "Exit", amount: "-", status: "expired", age: "3 days" },
];

const COLUMNS: TableColumn<Row>[] = [
  { key: "client", header: "Client", render: (r) => <span className="font-medium">{r.client}</span> },
  { key: "type", header: "Type", render: (r) => r.type, hideOnMobile: true },
  { key: "amount", header: "Amount", render: (r) => r.amount, align: "right" },
  { key: "status", header: "Status", render: (r) => <StatusChip status={r.status} /> },
  { key: "age", header: "Age", render: (r) => <span className="text-muted">{r.age}</span>, hideOnMobile: true },
];

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card title={title}>
      <div className="flex flex-col gap-4">{children}</div>
    </Card>
  );
}

// Every screen of the portal on the mock data (ids come from the seed in lib/lawyerApi.mock.ts).
const SCREENS = [
  { id: "L1", name: "Invitation", href: "/invite/demo-token" },
  { id: "L1", name: "Invitation, expired", href: "/invite/expired" },
  { id: "L1", name: "Invitation, already used", href: "/invite/used" },
  { id: "L2", name: "Account and passkey", href: "/invite/demo-token/account" },
  { id: "L3", name: "Login", href: "/login" },
  { id: "L4", name: "Dashboard", href: "/" },
  { id: "L5", name: "Requests", href: "/requests" },
  { id: "L6", name: "Transfer request", href: "/requests/req_01" },
  { id: "L7", name: "Recovery request", href: "/requests/req_03" },
  { id: "L7", name: "Exit request", href: "/requests/req_04" },
  { id: "L8", name: "Client policy", href: "/clients/client.lea/policy" },
  { id: "L9", name: "Journal", href: "/journal" },
  { id: "L10", name: "Legal", href: "/legal" },
];

export function UiShowcase() {
  const [open, setOpen] = useState(false);
  const [endsAt] = useState(() => Date.now() + 160_000);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[28px] font-semibold leading-9 text-ink">UI kit</h1>
        <p className="mt-1 text-sm text-muted">Primitives copied from the client design language. Development page.</p>
      </div>

      <Card title="All screens (mock data)">
        <ul className="grid gap-x-6 sm:grid-cols-2">
          {SCREENS.map((sc) => (
            <li key={sc.href}>
              <Link href={sc.href} className="flex min-h-11 items-center gap-3 text-sm text-ink">
                <span className="w-9 shrink-0 font-medium text-warn">{sc.id}</span>
                {sc.name}
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Pending requests" value={2} note="waiting for you" icon={<Inbox size={20} strokeWidth={1.75} />} />
        <Stat label="Clients" value={3} icon={<ShieldCheck size={20} strokeWidth={1.75} />} />
        <Stat label="Automatic decisions" value={14} note="24.00 USDC in the last 24 hours" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Block title="Buttons">
          <Button>Approve with passkey</Button>
          <Button variant="danger">
            Decline with passkey
          </Button>
          <Button variant="dark">Dark</Button>
          <Button variant="ghost">Ghost</Button>
          <Button disabled>Disabled</Button>
          <Button loading>Loading</Button>
        </Block>

        <Block title="Inputs, chips and pills">
          <Input label="Per transfer (USDC)" placeholder="100" hint="Applies to each transfer." />
          <Input label="Recipient address" defaultValue="0x12" error="Enter a full address." />
          <div className="flex flex-wrap gap-2">
            <StatusChip status="pending" />
            <StatusChip status="approved" />
            <StatusChip status="refused" />
            <StatusChip status="expired" />
            <StatusChip status="verified" />
            <StatusChip status="warning" />
            <StatusChip status="failed" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SimulatedPill />
            <SimulatedPill>Simulated identity check</SimulatedPill>
            <Countdown endsAt={endsAt} />
          </div>
          <CopyField label="Intent hash" value="0x9f2c41d7a0b34e58c61d0e2a7b8f3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d" display="0x9f2c41…b3c4d" />
        </Block>
      </div>

      <div className="flex flex-col gap-3">
        <Banner variant="info" action={undefined}>
          <span className="flex items-center gap-2">
            <Lock size={16} strokeWidth={1.75} aria-hidden="true" />
            Your approval applies to this exact amount and recipient only. You can never move funds alone.
          </span>
        </Banner>
        <Banner variant="warning" title="Recovery requested">
          Recovery requested for Client B. Contact the client by another channel before approving.
        </Banner>
        <Banner variant="demo">Demo mode: recovery delay is 2 minutes. In production it would be 24 hours.</Banner>
      </div>

      <Card title="Requests" flush>
        <Table columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} caption="Sample requests" />
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Empty state">
          <EmptyState icon={<Inbox size={24} strokeWidth={1.75} />} />
        </Card>
        <Block title="Dialog">
          <Button variant="secondary" onClick={() => setOpen(true)}>
            Open dialog
          </Button>
        </Block>
      </div>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Decline this request?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => setOpen(false)}>Decline with passkey</Button>
          </>
        }
      >
        You decline 120.00 USDC to the recipient shown in the request. Nothing is sent.
      </Dialog>
    </div>
  );
}
