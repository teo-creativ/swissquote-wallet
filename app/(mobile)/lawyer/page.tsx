"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Copy, KeyRound, Share2 } from "lucide-react";
import { getLawyerStatus, inviteLawyer } from "@/lib/sqkeys";
import { isMockMode } from "@/lib/sqkeys.mode";
import { Banner, BottomSheet, Button, IconButton, Input, KeyShowcase, PageShell, RowCard, SimulatedPill, StatusChip } from "@/components/ui";
import { Guard } from "../_lib/Guard";
import { isNotAuthenticated, messageOf } from "../_lib/errors";
import { SimulateLawyerButton } from "../_lib/SimulateLawyerButton";
import { SESSION_KEYS, readSession, writeSession } from "../_lib/session";

type LawyerState = { status: "none" | "invited" | "accepted"; displayName?: string; expiresAt?: string };
type StoredInvite = { url: string; expiresAt: string; lawyerName: string };

const POLL_MS = 5000;

// C5. Texts: annex F.2. The invitation link is only returned when it is created, so it is kept in sessionStorage
// to be shown again (it is a one-time link that expires in 7 days, not a secret of the wallet).
function Lawyer({ initial }: { initial: LawyerState["status"] }) {
  const router = useRouter();
  const [lawyer, setLawyer] = useState<LawyerState>({ status: initial });
  const [invite, setInvite] = useState<StoredInvite | null>(() => readSession<StoredInvite | null>(SESSION_KEYS.invite, null));
  const [lawyerName, setLawyerName] = useState(() => readSession<StoredInvite | null>(SESSION_KEYS.invite, null)?.lawyerName ?? "");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);

  useEffect(() => setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function"), []);

  const refresh = useCallback(async () => {
    try {
      setLawyer(await getLawyerStatus());
    } catch (e) {
      if (isNotAuthenticated(e)) router.replace("/login");
      // A failed poll is silent: the next one retries.
    }
  }, [router]);

  // Status of the invitation, every 5 s while we wait (CDC 7.2).
  useEffect(() => {
    void refresh();
    if (lawyer.status === "accepted") return;
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [refresh, lawyer.status]);

  async function createLink() {
    setError(null);
    setLoading(true);
    try {
      const clientName = readSession<string>(SESSION_KEYS.displayName, "A SQ Keys client");
      const { inviteUrl, expiresAt } = await inviteLawyer(clientName);
      const stored: StoredInvite = { url: inviteUrl, expiresAt, lawyerName: lawyerName.trim() };
      writeSession(SESSION_KEYS.invite, stored);
      setInvite(stored);
      setLawyer({ status: "invited", expiresAt });
      setSheetOpen(true);
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setLoading(false);
    }
  }

  async function copyLink() {
    if (!invite) return;
    try {
      await navigator.clipboard.writeText(invite.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked: the link is in the field above, selectable by hand.
    }
  }

  async function shareLink() {
    if (!invite) return;
    const greeting = invite.lawyerName ? `Hello ${invite.lawyerName}, ` : "";
    try {
      await navigator.share({ title: "SQ Keys invitation", text: `${greeting}I invite you as my lawyer on SQ Keys.`, url: invite.url });
    } catch {
      // Dismissed by the user: nothing to do.
    }
  }

  const accepted = lawyer.status === "accepted";
  const invited = lawyer.status === "invited" && invite !== null;
  const expiresAt = lawyer.expiresAt ?? invite?.expiresAt;
  const expired = invited && expiresAt !== undefined && Date.parse(expiresAt) < Date.now();

  // Once accepted, the sheet has nothing left to offer.
  useEffect(() => {
    if (accepted) setSheetOpen(false);
  }, [accepted]);

  const footer = accepted ? (
    <Button trailingIcon={<ChevronRight size={24} strokeWidth={1.75} />} onClick={() => router.push("/key")}>
      Continue
    </Button>
  ) : invited ? (
    <Button disabled trailingIcon={<ChevronRight size={24} strokeWidth={1.75} />}>
      Continue
    </Button>
  ) : (
    <Button loading={loading} icon={<KeyRound size={24} strokeWidth={1.75} />} onClick={createLink}>
      Create invitation link
    </Button>
  );

  return (
    <PageShell footer={footer}>
      {!accepted && !invited && <KeyShowcase variant="lawyer" className="-mt-2 h-[400px] overflow-hidden" />}
      <h1 className="mt-6 text-[28px] font-semibold leading-8 text-ink">Invite your lawyer</h1>
      <p className="mt-3 text-base leading-6 text-muted">
        Your lawyer holds another third of your key. They protect large or unusual transfers and help you recover your wallet. They can never move your funds alone.
      </p>

      {!accepted && !invited && (
        <Input
          className="mt-6"
          label="Your lawyer's name (optional)"
          autoComplete="off"
          value={lawyerName}
          onChange={(e) => setLawyerName(e.target.value)}
        />
      )}

      {(accepted || invited) && (
        <div className="mt-6 flex flex-col gap-3">
          <div aria-live="polite">
            <RowCard
              leading={<KeyRound size={20} strokeWidth={1.75} />}
              title={invite?.lawyerName || "Your lawyer"}
              subtitle={accepted ? "Your lawyer accepted." : "Waiting for your lawyer…"}
              trailing={accepted ? <StatusChip status="verified" /> : <StatusChip status="pending" />}
            />
          </div>
          {isMockMode && (
            <div>
              <SimulatedPill>Simulated lawyer (played by a team member)</SimulatedPill>
            </div>
          )}
          {expired && <Banner variant="warning">This link expired. Create a new one.</Banner>}
          {!accepted && (
            <>
              <Button variant="secondary" disabled={expired} onClick={() => setSheetOpen(true)}>Show the link</Button>
              <Button variant="ghost" loading={loading} onClick={createLink}>Create a new link</Button>
              {isMockMode && <SimulateLawyerButton onDone={refresh} />}
            </>
          )}
        </div>
      )}
      {error && <Banner variant="warning" className="mt-4">{error}</Banner>}

      <BottomSheet open={sheetOpen && invite !== null} onClose={() => setSheetOpen(false)} title="Invite your lawyer">
        <p className="mb-4 text-base leading-6 text-muted">Send this link to your lawyer. It works once and expires in 7 days.</p>
        <Input label="Invitation link" readOnly value={invite?.url ?? ""} onFocus={(e) => e.currentTarget.select()} />
        <div className="mt-4 flex items-center gap-3">
          <Button variant="dark" icon={<Copy size={24} strokeWidth={1.75} />} onClick={copyLink}>
            {copied ? "Copied" : "Copy link"}
          </Button>
          {canShare && <IconButton label="Share" variant="surface" className="size-14" icon={<Share2 size={22} strokeWidth={1.75} />} onClick={shareLink} />}
        </div>
        <span role="status" className="sr-only">{copied ? "Link copied" : ""}</span>
        <div className="mt-3">
          <Button variant="ghost" loading={loading} onClick={createLink}>Create a new link</Button>
        </div>
        <div className="mt-2 border-t border-line pt-4">
          <Button trailingIcon={<ChevronRight size={24} strokeWidth={1.75} />} onClick={() => setSheetOpen(false)}>Continue</Button>
        </div>
      </BottomSheet>
    </PageShell>
  );
}

export default function LawyerPage() {
  return <Guard route="/lawyer">{(account) => <Lawyer initial={account.lawyer.status} />}</Guard>;
}
