"use client";

import { useState } from "react";
import { submitBusinessClaim } from "@/lib/professionals/actions";
import { parseSkills, validateClaim } from "@/lib/professionals/validate";
import type { Dictionary } from "@/lib/i18n";

type Copy = Dictionary["professionals"];

/**
 * Guest-friendly verification claim: honeypot + caps at intake, human review
 * before anything publishes. Instant client feedback mirrors the server gate.
 */
export function ClaimForm({
  copy,
  locations,
  locationLabel,
}: {
  copy: Copy;
  locations: { id: string; name: string }[];
  locationLabel: string;
}) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [locationId, setLocationId] = useState("");
  const [form, setForm] = useState({
    businessName: "",
    claimantName: "",
    contactPhone: "",
    contactEmail: "",
    whatsapp: "",
    categoryText: "",
    skillsRaw: "",
    description: "",
  });

  const inputCls =
    "h-11 min-h-[44px] w-full rounded-md border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const field = validateClaim({ ...form });
    if (field) {
      setNotice(copy.claimFieldError.replace("{field}", field));
      return;
    }
    setBusy(true);
    const res = await submitBusinessClaim({ ...form, locationId: locationId || undefined });
    setBusy(false);
    if (!res.ok) {
      setNotice(res.error);
      return;
    }
    setDone(copy.claimDone.replace("{ref}", res.ref));
    setNotice(null);
  }

  if (done) {
    return (
      <p role="status" className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-6 text-sm">
        {done}
      </p>
    );
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <form onSubmit={(e) => void submit(e)} className="grid max-w-2xl gap-4">
      {/* Honeypot — humans never see it. */}
      <input type="text" name="website" autoComplete="off" tabIndex={-1} className="hidden" aria-hidden onChange={() => {}} />
      <label className="grid gap-1 text-sm font-medium">
        {copy.claimBusinessName}
        <input value={form.businessName} onChange={set("businessName")} required maxLength={200} className={inputCls} />
      </label>
      <label className="grid gap-1 text-sm font-medium">
        {copy.claimYourName}
        <input value={form.claimantName} onChange={set("claimantName")} required maxLength={200} className={inputCls} />
      </label>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="grid gap-1 text-sm font-medium">
          {copy.claimPhone}
          <input value={form.contactPhone} onChange={set("contactPhone")} maxLength={40} inputMode="tel" className={inputCls} />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          {copy.claimEmail}
          <input value={form.contactEmail} onChange={set("contactEmail")} maxLength={200} inputMode="email" className={inputCls} />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          {copy.claimWhatsapp}
          <input value={form.whatsapp} onChange={set("whatsapp")} maxLength={40} inputMode="tel" className={inputCls} />
        </label>
      </div>
      <p className="text-xs text-muted-foreground">{copy.claimContactHint}</p>
      {locations.length > 0 ? (
        <label className="grid gap-1 text-sm font-medium">
          {locationLabel}
          <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className={inputCls}>
            <option value="">{locationLabel}</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label className="grid gap-1 text-sm font-medium">
        {copy.claimCategory}
        <input value={form.categoryText} onChange={set("categoryText")} maxLength={120} className={inputCls} />
      </label>
      <label className="grid gap-1 text-sm font-medium">
        {copy.claimSkills}
        <input
          value={form.skillsRaw}
          onChange={set("skillsRaw")}
          maxLength={500}
          placeholder="plumbing, leak repair, solar"
          className={inputCls}
        />
        {form.skillsRaw.trim() ? (
          <span className="flex flex-wrap gap-1 pt-1">
            {parseSkills(form.skillsRaw).map((s) => (
              <span key={s} className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                {s}
              </span>
            ))}
          </span>
        ) : null}
      </label>
      <label className="grid gap-1 text-sm font-medium">
        {copy.claimDescription}
        <textarea
          value={form.description}
          onChange={set("description")}
          rows={4}
          maxLength={2000}
          className="w-full rounded-md border border-border bg-background p-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </label>
      <button
        type="submit"
        disabled={busy}
        className="min-h-[44px] max-w-xs rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        {busy ? copy.claimSending : copy.claimSubmit}
      </button>
      {notice ? (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      ) : null}
    </form>
  );
}
