import "server-only";

import { logger } from "@/lib/observability/logger";
import { sendEmail } from "./channels";

/**
 * Guest receipts (gap A): guests leave an email on public intake forms but
 * have no account, so the outbox/user loop can't reach them. We send a
 * single direct transactional receipt via SMTP — best-effort, never throws,
 * never fails the intake action.
 *
 * Anti-spam policy (explicit decision, see docs/notifications.md):
 * - one receipt per successful intake, only to the address the guest typed;
 * - no marketing, no bulk, no follow-ups — decisions go to staff only;
 * - invalid/unconfigured SMTP = logged skip, intake still succeeds.
 */

export type GuestReceiptKind =
  | "submission"
  | "advertise"
  | "contact"
  | "takedown"
  | "data_request"
  | "correction";

const COPY: Record<GuestReceiptKind, { subject: string; title: string; body: string; titleFr: string; bodyFr: string }> = {
  submission: {
    subject: "We received your submission — Eagle Eye Africa",
    title: "We received your submission",
    body: "Thank you — our editors will review it and publish verified stories with credit to you. This is the only email we will send about this submission unless you create an account.",
    titleFr: "Nous avons reçu votre soumission",
    bodyFr:
      "Merci — nos rédacteurs vont l'examiner et publier les histoires vérifiées en vous créditant. C'est le seul e-mail que nous enverrons pour cette soumission, sauf si vous créez un compte.",
  },
  advertise: {
    subject: "Advertising inquiry received — Eagle Eye Africa",
    title: "Advertising inquiry received",
    body: "Thanks for your interest — our advertising team will reply with availability and a quote. No marketing list: you will only hear about this inquiry.",
    titleFr: "Demande publicitaire reçue",
    bodyFr:
      "Merci pour votre intérêt — notre équipe publicitaire répondra avec les disponibilités et un devis. Pas de liste marketing : vous ne recevrez que des nouvelles de cette demande.",
  },
  contact: {
    subject: "Message received — Eagle Eye Africa",
    title: "Message received",
    body: "Thank you — the editorial team will reply within two working days. This is a one-off receipt, not a subscription.",
    titleFr: "Message reçu",
    bodyFr:
      "Merci — l'équipe éditoriale répondra sous deux jours ouvrés. Ceci est un simple accusé de réception, pas une inscription.",
  },
  takedown: {
    subject: "Takedown request received — Eagle Eye Africa",
    title: "Takedown request received",
    body: "The editorial team will review your copyright request and reply by email. This is a one-off receipt, not a subscription.",
    titleFr: "Demande de retrait reçue",
    bodyFr:
      "L'équipe éditoriale examinera votre demande de retrait et répondra par e-mail. Ceci est un simple accusé de réception, pas une inscription.",
  },
  data_request: {
    subject: "Privacy request received — Eagle Eye Africa",
    title: "Privacy request received",
    body: "We will respond by email within 30 days. This is a one-off receipt, not a subscription.",
    titleFr: "Demande de données reçue",
    bodyFr:
      "Nous répondrons par e-mail sous 30 jours. Ceci est un simple accusé de réception, pas une inscription.",
  },
  correction: {
    subject: "Correction report received — Eagle Eye Africa",
    title: "Correction report received",
    body: "Thank you — editors will check the article and correct it if needed. This is a one-off receipt, not a subscription.",
    titleFr: "Signalement reçu",
    bodyFr:
      "Merci — les rédacteurs vérifieront l'article et le corrigeront si besoin. Ceci est un simple accusé de réception, pas une inscription.",
  },
};

export function isReceiptEmail(value: string | null | undefined): boolean {
  return !!value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export async function sendGuestReceipt(kind: GuestReceiptKind, to: string | null | undefined): Promise<void> {
  try {
    if (!isReceiptEmail(to)) return;
    const c = COPY[kind];
    const address = (to as string).trim().slice(0, 160);
    // Bilingual body in one send (guest locale unknown at intake).
    const body = `${c.body}\n\n---\n\n${c.bodyFr}`;
    const res = await sendEmail(address, c.subject, c.title, body, null);
    if (!res.delivered) {
      logger.info("notify-guest", "receipt skipped", { kind, reason: res.skipped ?? res.error ?? "unknown" });
    }
  } catch (err) {
    logger.error("notify-guest", "receipt exception", {
      error: err instanceof Error ? err.message : String(err),
      kind,
    });
  }
}
