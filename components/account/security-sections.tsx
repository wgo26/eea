'use client';

import { useState } from 'react';
import { ShieldCheck, ShieldOff, Download, LogOut, Trash2 } from 'lucide-react';
import { enrollMfa, getMfaFactors, unenrollMfa, verifyMfaEnrollment, type MfaFactor } from '@/lib/auth/mfa';
import { signOutEverywhere, exportMyData, deleteMyAccount } from '@/lib/account/security';
import { ConfirmDialog } from '@/components/admin/confirm-dialog';
import type { Dictionary } from '@/lib/i18n';

type SecurityCopy = Dictionary['account']['security'];

/* ------------------------------------------------------------------ */
/* Two-factor authentication                                           */
/* ------------------------------------------------------------------ */

export function MfaSection({ copy, initial }: { copy: SecurityCopy; initial: MfaFactor[] }) {
  const [factors, setFactors] = useState(initial);
  const [enrolling, setEnrolling] = useState<{ factorId: string; qrCode: string; secret: string } | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setFactors(await getMfaFactors());
  }

  async function startEnroll() {
    setBusy(true);
    setError(null);
    const result = await enrollMfa();
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setEnrolling({ factorId: result.factorId, qrCode: result.qrCode, secret: result.secret });
    setCode('');
  }

  async function confirmEnroll() {
    if (!enrolling) return;
    setBusy(true);
    setError(null);
    const result = await verifyMfaEnrollment(enrolling.factorId, code);
    setBusy(false);
    if (!result.ok) {
      setError(copy.mfaError);
      return;
    }
    setEnrolling(null);
    await refresh();
  }

  async function disable(factorId: string) {
    setBusy(true);
    const result = await unenrollMfa(factorId);
    setBusy(false);
    if (result.ok) {
      setEnrolling(null);
      await refresh();
    } else {
      setError(result.error);
    }
  }

  return (
    <section className="rounded-2xl border bg-card p-5">
      <h2 className="flex items-center gap-2 text-sm font-bold">
        <ShieldCheck className="h-4 w-4 text-primary" aria-hidden />
        {copy.mfaTitle}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{copy.mfaBody}</p>
      <p className="mt-2 text-xs font-medium text-muted-foreground">
        {factors.length > 0 ? copy.mfaEnabled : copy.mfaDisabled}
      </p>

      {enrolling ? (
        <div className="mt-4 space-y-3 rounded-xl border border-border bg-background p-4">
          <p className="text-sm text-muted-foreground">{copy.mfaScan}</p>
          <div
            className="mx-auto w-fit overflow-hidden rounded-lg border border-border bg-white p-2 [&>svg]:block [&>svg]:h-48 [&>svg]:w-48"
            dangerouslySetInnerHTML={{ __html: enrolling.qrCode }}
          />
          <p className="text-xs text-muted-foreground">
            {copy.mfaManual}: <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">{enrolling.secret}</code>
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="123456"
              aria-label={copy.mfaCodeLabel}
              className="h-10 w-40 rounded-md border border-border bg-background px-3 text-center text-lg tracking-[0.4em] focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <button
              type="button"
              onClick={confirmEnroll}
              disabled={busy || code.replace(/\D/g, '').length !== 6}
              className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {copy.mfaConfirm}
            </button>
          </div>
        </div>
      ) : null}

      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {factors.length === 0 && !enrolling ? (
          <button
            type="button"
            onClick={startEnroll}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <ShieldCheck className="h-4 w-4" aria-hidden />
            {copy.mfaEnable}
          </button>
        ) : null}
        {factors.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => disable(f.id)}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-destructive disabled:opacity-50"
          >
            <ShieldOff className="h-4 w-4" aria-hidden />
            {copy.mfaDisable}
          </button>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Sessions                                                            */
/* ------------------------------------------------------------------ */

export function SessionsSection({ copy, email }: { copy: SecurityCopy; email: string }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSignOutEverywhere() {
    setBusy(true);
    const result = await signOutEverywhere();
    setBusy(false);
    if (result.ok) setDone(true);
  }

  return (
    <section className="rounded-2xl border bg-card p-5">
      <h2 className="flex items-center gap-2 text-sm font-bold">
        <LogOut className="h-4 w-4 text-primary" aria-hidden />
        {copy.sessionsTitle}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{copy.sessionsBody}</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-4 py-2 text-sm">
          <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
          <span className="font-medium">{copy.thisDevice}</span>
          <span className="text-muted-foreground">{email}</span>
        </span>
        <button
          type="button"
          onClick={handleSignOutEverywhere}
          disabled={busy || done}
          className="inline-flex items-center rounded-md border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
        >
          {done ? copy.signedOutEverywhere : copy.signOutEverywhere}
        </button>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Data export                                                         */
/* ------------------------------------------------------------------ */

export function ExportSection({ copy }: { copy: SecurityCopy }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    setBusy(true);
    setError(null);
    const result = await exportMyData();
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: 'application/json' });
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href;
    link.download = 'eagle-eye-africa-data.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(href);
  }

  return (
    <section className="rounded-2xl border bg-card p-5">
      <h2 className="flex items-center gap-2 text-sm font-bold">
        <Download className="h-4 w-4 text-primary" aria-hidden />
        {copy.exportTitle}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{copy.exportBody}</p>
      {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
      <button
        type="button"
        onClick={handleExport}
        disabled={busy}
        className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        <Download className="h-4 w-4" aria-hidden />
        {busy ? copy.exportPreparing : copy.exportButton}
      </button>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Self-service deletion                                               */
/* ------------------------------------------------------------------ */

export function DeleteSection({ copy }: { copy: SecurityCopy }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setBusy(true);
    setError(null);
    try {
      await deleteMyAccount(password);
      // deleteMyAccount redirects home on success — reaching here means failure,
      // but the action throws on redirect so this is defensive only.
      setBusy(false);
    } catch (e) {
      // Next.js redirect() throws NEXT_REDIRECT — a successful deletion.
      if (e instanceof Error && e.message.includes('NEXT_REDIRECT')) throw e;
      setBusy(false);
      setError(copy.deleteError);
    }
  }

  return (
    <section className="rounded-2xl border border-destructive/40 bg-card p-5">
      <h2 className="flex items-center gap-2 text-sm font-bold text-destructive">
        <Trash2 className="h-4 w-4" aria-hidden />
        {copy.deleteTitle}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{copy.deleteBody}</p>
      {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
      <div className="mt-3 flex gap-4">
        <input
          type="password"
          value={password}
          onChange={(e) => { setPassword(e.target.value); setError(null); }}
          placeholder={copy.deletePassword}
          aria-label={copy.deletePassword}
          autoComplete="current-password"
          onKeyDown={(e) => { if (e.key === 'Enter' && password) setOpen(true); }}
          className="h-10 max-w-xs flex-1 rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={!password || busy}
          className="inline-flex h-10 items-center rounded-md border border-destructive/40 px-4 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
        >
          {copy.deleteConfirm}
        </button>
      </div>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={copy.deleteTitle}
        description={copy.deleteBody}
        confirmLabel={copy.deleteConfirm}
        cancelLabel={copy.cancel}
        loading={busy}
        tone="danger"
        onConfirm={handleDelete}
      />
    </section>
  );
}
