// Pure rules of the console. No state, no I/O: the same function runs on the server (to validate an action)
// and in the browser (to show the buttons and countdowns). Nodes enforce the same rules independently (CDC 6.2 step 6).
import type { Recovery, RecoveryView, IdentityState, LawyerState, RecoveryStatus } from "./console.types";

/** How long the simulated identity check takes (document, selfie, banking question). */
export const IDENTITY_CHECK_MS = 3_000;
/** How long the simulated lawyer takes to approve once the identity is verified. */
export const LAWYER_APPROVAL_MS = 8_000;
/** Safety delay used by the demo. Production is 24 h (CDC 6.2 step 6). */
export const DEMO_DELAY_SECONDS = 120;

export const REASON_IDENTITY_NOT_REQUESTED = "Send the identity check first.";
export const REASON_IDENTITY_PENDING = "Co-signing requires a successful identity check. The check is still running.";
export const REASON_IDENTITY_FAILED = "Co-signing requires a successful identity check. This one failed.";
export const REASON_LAWYER_PENDING = "Waiting for the client's lawyer to approve.";
export const REASON_CANCELLED = "This recovery was cancelled.";

function formatLeft(ms: number): string {
  const s = Math.ceil(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m} min ${s % 60} s` : `${s} s`;
}

export const REASON_AUTOMATIC = "Swissquote signs by itself once the identity check passed, the safety delay is over and the lawyer approved.";

/** Live mode: the state is real, so nothing is simulated by timers. P3 signs on its own; the console only shows it. */
function deriveReal(r: Recovery & { real: NonNullable<Recovery["real"]> }, now: number): RecoveryView {
  const { real } = r;
  const releaseAfter = real.releaseAfter;
  const delayElapsed = releaseAfter !== null && now >= releaseAfter;
  const done = r.cosignedAt !== null;
  let status: RecoveryStatus;
  if (r.cancelledAt !== null) status = "cancelled";
  else if (done) status = "completed";
  else if (real.identity === "failed") status = "blocked";
  else if (real.identity === "verified") status = "in_progress";
  else status = "pending";
  return {
    ...r, identity: real.identity, identityVerifiedAt: real.identityVerifiedAt, identityFailedAt: real.identityFailedAt, lawyer: real.lawyer,
    lawyerApprovedAt: real.lawyerApprovedAt, releaseAfter, delayElapsed, msLeft: releaseAfter === null ? null : Math.max(0, releaseAfter - now), status,
    canCosign: false, cosignBlockedReason: done ? null : r.cancelledAt !== null ? REASON_CANCELLED : real.identity === "failed" ? REASON_IDENTITY_FAILED : REASON_AUTOMATIC,
  };
}

export function deriveRecovery(r: Recovery, now: number): RecoveryView {
  if (r.real) return deriveReal(r as Recovery & { real: NonNullable<Recovery["real"]> }, now);
  let identity: IdentityState = "not_requested";
  let identityVerifiedAt: number | null = null;
  let identityFailedAt: number | null = null;
  if (r.identityRequestedAt !== null) {
    const done = r.identityRequestedAt + IDENTITY_CHECK_MS;
    if (now < done) identity = "pending";
    else if (r.identityOutcome === "pass") {
      identity = "verified";
      identityVerifiedAt = done;
    } else {
      identity = "failed";
      identityFailedAt = done;
    }
  }

  let lawyer: LawyerState = "pending";
  let lawyerApprovedAt: number | null = null;
  if (identityVerifiedAt !== null && now >= identityVerifiedAt + LAWYER_APPROVAL_MS) {
    lawyer = "approved";
    lawyerApprovedAt = identityVerifiedAt + LAWYER_APPROVAL_MS;
  }

  const releaseAfter = identityVerifiedAt !== null ? identityVerifiedAt + r.delaySeconds * 1000 : null;
  const delayElapsed = releaseAfter !== null && now >= releaseAfter;
  const msLeft = releaseAfter === null ? null : Math.max(0, releaseAfter - now);

  let cosignBlockedReason: string | null = null;
  if (r.cosignedAt === null) {
    if (r.cancelledAt !== null) cosignBlockedReason = REASON_CANCELLED;
    else if (identity === "not_requested") cosignBlockedReason = REASON_IDENTITY_NOT_REQUESTED;
    else if (identity === "pending") cosignBlockedReason = REASON_IDENTITY_PENDING;
    else if (identity === "failed") cosignBlockedReason = REASON_IDENTITY_FAILED;
    else if (lawyer !== "approved") cosignBlockedReason = REASON_LAWYER_PENDING;
    else if (!delayElapsed) cosignBlockedReason = `Safety delay running: ${formatLeft(msLeft ?? 0)} left.`;
  }
  const done = r.cosignedAt !== null;

  let status: RecoveryStatus;
  if (r.cancelledAt !== null) status = "cancelled";
  else if (done) status = "completed";
  else if (identity === "failed") status = "blocked";
  else if (identity === "verified") status = "in_progress";
  else status = "pending";

  return {
    ...r,
    identity,
    identityVerifiedAt,
    identityFailedAt,
    lawyer,
    lawyerApprovedAt,
    releaseAfter,
    delayElapsed,
    msLeft,
    status,
    canCosign: !done && cosignBlockedReason === null,
    cosignBlockedReason,
  };
}

/** mm:ss, or h:mm:ss from one hour (production delay is 24 h). */
export function formatCountdown(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

const dateTime = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Zurich" });
const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Zurich" });

/** "10 Oct 2026, 15:20" in Swiss time, the same on server and client. */
export const formatDateTime = (ms: number) => dateTime.format(ms).replace(" at ", ", ");
export const formatTime = (ms: number) => time.format(ms);
