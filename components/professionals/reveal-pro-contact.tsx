"use client";

import { useState } from "react";
import { Eye, MessageCircle, Phone } from "lucide-react";
import { revealBusinessContact } from "@/lib/professionals/actions";
import { whatsappHref } from "@/lib/format";

export type ProContactLabels = {
  reveal: string;
  hide: string;
  rateLimited: string;
  unavailable: string;
};

/**
 * Gated pro-contact block (parity with seller contact): PII leaves the
 * server only through the rate-limited action, only for verified rows.
 */
export function RevealProContact({
  slug,
  hasPhone,
  hasEmail,
  hasWhatsapp,
  labels,
}: {
  slug: string;
  hasPhone: boolean;
  hasEmail: boolean;
  hasWhatsapp: boolean;
  labels: ProContactLabels;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [contact, setContact] = useState<{ phone: string | null; email: string | null; whatsapp: string | null } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    if (contact) {
      setOpen(true);
      return;
    }
    setBusy(true);
    const res = await revealBusinessContact(slug);
    setBusy(false);
    if (!res.ok) {
      setNotice(res.error === "rate_limited" ? labels.rateLimited : labels.unavailable);
      return;
    }
    setContact(res.contact);
    setOpen(true);
  }

  if (!hasPhone && !hasEmail && !hasWhatsapp) return null;

  return (
    <div className="grid gap-2 rounded-2xl border bg-card p-4">
      <button
        type="button"
        onClick={() => void toggle()}
        disabled={busy}
        className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        <Eye className="h-4 w-4" aria-hidden />
        {open ? labels.hide : labels.reveal}
      </button>
      {open && contact ? (
        <ul className="grid gap-1.5 text-sm">
          {contact.phone ? (
            <li>
              <a href={`tel:${contact.phone}`} className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline">
                <Phone className="h-3.5 w-3.5" aria-hidden />
                {contact.phone}
              </a>
            </li>
          ) : null}
          {contact.email ? (
            <li>
              <a href={`mailto:${contact.email}`} className="font-medium text-primary hover:underline">
                {contact.email}
              </a>
            </li>
          ) : null}
          {contact.whatsapp ? (
            <li>
              <a
                href={whatsappHref(contact.whatsapp, "")}
                target="_blank"
                rel="noopener"
                className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline"
              >
                <MessageCircle className="h-3.5 w-3.5" aria-hidden />
                WhatsApp
              </a>
            </li>
          ) : null}
        </ul>
      ) : null}
      {notice ? (
        <p role="status" className="text-xs text-muted-foreground">
          {notice}
        </p>
      ) : null}
    </div>
  );
}
