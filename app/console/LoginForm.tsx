"use client";
import { LockKeyhole } from "lucide-react";
import { useActionState } from "react";
import { Button, Input, SimulatedPill } from "@/components/ui";
import { loginAction, type LoginState } from "./actions";

export function LoginForm({ configured }: { configured: boolean }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {});
  return (
    <form action={action} className="w-full max-w-sm rounded-card border border-line bg-white p-8">
      <div className="flex items-center gap-2">
        <LockKeyhole size={22} strokeWidth={1.75} className="text-brand" aria-hidden="true" />
        <SimulatedPill>Simulated Swissquote console</SimulatedPill>
      </div>
      <h1 className="mt-4 text-2xl font-semibold">Console access</h1>
      <p className="mt-1 text-sm text-muted">Back-office of the SQ Keys prototype. Enter the console password.</p>
      {!configured && (
        <p role="alert" className="mt-4 rounded-card bg-warn-bg p-3 text-sm text-warn">
          CONSOLE_PASSWORD is not set on the server, so nobody can sign in.
        </p>
      )}
      <div className="mt-6">
        <Input label="Password" name="password" type="password" autoComplete="current-password" error={state.error} required />
      </div>
      <Button type="submit" loading={pending} disabled={!configured} className="mt-6">
        Sign in
      </Button>
    </form>
  );
}
