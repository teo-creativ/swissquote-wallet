"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Banner, Button, PageShell } from "@/components/ui";
import { getBalance } from "@/lib/sqkeys";
import { isMockMode } from "@/lib/sqkeys.mode";
import { Guard } from "../_lib/Guard";

// C12. Address, copy button, QR code. The QR is black on white for reliable scanning.
function Receive({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  const [usdc, setUsdc] = useState<string | null>(null);

  // The real balance of this address on Base Sepolia, read from the chain.
  useEffect(() => {
    if (isMockMode) return;
    let alive = true;
    getBalance().then((b) => alive && setUsdc(b.usdc), () => undefined);
    return () => { alive = false; };
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked: the address above can be selected by hand.
    }
  }

  return (
    <PageShell title="Receive USDC" backHref="/home">
      <div className="flex flex-col items-center gap-6">
        <div className="rounded-card bg-white p-4 shadow-float">
          <QRCodeSVG value={address} size={208} level="M" bgColor="white" fgColor="black" title="QR code of your wallet address" />
        </div>
        <p className="w-full break-all rounded-card bg-surface p-4 text-center font-mono text-sm text-ink">{address}</p>
        <Button variant="dark" icon={copied ? <Check size={24} strokeWidth={1.75} /> : <Copy size={24} strokeWidth={1.75} />} onClick={copy}>
          {copied ? "Copied" : "Copy address"}
        </Button>
        <span role="status" className="sr-only">{copied ? "Address copied" : ""}</span>
        {usdc !== null && <p className="text-sm text-muted">Balance on this address: <span className="font-semibold text-ink">{usdc} USDC</span></p>}
        <Banner variant="info" className="w-full">Only send USDC on the Base network to this address. Testnet only: no real funds.</Banner>
        {!isMockMode && (
          <Banner variant="demo" className="w-full">
            Need test USDC? Open faucet.circle.com, choose Base Sepolia and paste this address. You do not need ETH: Swissquote pays the network fees. Or use &ldquo;From Swissquote&rdquo; on the home screen.
          </Banner>
        )}
      </div>
    </PageShell>
  );
}

export default function ReceivePage() {
  return <Guard route="/receive">{(account) => (account.address ? <Receive address={account.address} /> : null)}</Guard>;
}
