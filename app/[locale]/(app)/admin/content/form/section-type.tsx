"use client";

import { ui, Field } from "@/lib/admin/ui-constants";
import type { Dictionary } from "@/lib/i18n";
import type { ContentType, FormValues } from "./values";
import { Section } from "./shell";

type Copy = Dictionary["admin"]["content"];

const inputCls = ui.input;

/**
 * Section 5 — Type-specific details (plain sections, no accordions):
 * listing (price/currency/seller contact), notice (type/org/dates/official),
 * culture (event schedule/venue/organizer). Only the active type renders.
 */
export function TypeSection(props: {
  type: ContentType;
  values: FormValues;
  patch: (p: Partial<FormValues>) => void;
  copy: Copy;
}) {
  const { type, values: v, patch, copy } = props;

  return (
    <>
      {type === "listing" && (
        <Section title={copy.listingDetails}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={copy.priceLabel}>
              <input
                type="number"
                min="0"
                value={v.price}
                onChange={(e) => patch({ price: e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field label={copy.currencyLabel}>
              <input
                value={v.currency}
                onChange={(e) => patch({ currency: e.target.value })}
                maxLength={3}
                className={inputCls}
              />
            </Field>
            <Field label={copy.sellerName}>
              <input
                value={v.sellerName}
                onChange={(e) => patch({ sellerName: e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field label={copy.contactPhone}>
              <input
                value={v.contactPhone}
                onChange={(e) => patch({ contactPhone: e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field label={copy.contactEmail}>
              <input
                value={v.contactEmail}
                onChange={(e) => patch({ contactEmail: e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field label={copy.whatsappNumber}>
              <input
                value={v.whatsappNumber}
                onChange={(e) => patch({ whatsappNumber: e.target.value })}
                className={inputCls}
              />
            </Field>
          </div>
        </Section>
      )}

      {type === "notice" && (
        <Section title={copy.noticeDetails}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={copy.noticeTypeLabel}>
              <select
                value={v.noticeType}
                onChange={(e) => patch({ noticeType: e.target.value })}
                className={inputCls}
              >
                {Object.entries(copy.noticeTypes).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={copy.organization}>
              <input
                value={v.organization}
                onChange={(e) => patch({ organization: e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field label={copy.noticeDate}>
              <input
                type="date"
                value={v.noticeDate}
                onChange={(e) => patch({ noticeDate: e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field label={copy.expiryDate}>
              <input
                type="date"
                value={v.noticeExpiry}
                onChange={(e) => patch({ noticeExpiry: e.target.value })}
                className={inputCls}
              />
            </Field>
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <input
                type="checkbox"
                checked={v.isOfficial}
                onChange={(e) => patch({ isOfficial: e.target.checked })}
              />
              {copy.isOfficial}
            </label>
          </div>
        </Section>
      )}

      {type === "culture" && (
        <Section title={copy.eventDetails}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={copy.eventStartsAt}>
              <input
                type="datetime-local"
                value={v.eventStartsAt}
                onChange={(e) => patch({ eventStartsAt: e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field label={copy.eventEndsAt}>
              <input
                type="datetime-local"
                value={v.eventEndsAt}
                onChange={(e) => patch({ eventEndsAt: e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field label={copy.venueName}>
              <input
                value={v.venueName}
                onChange={(e) => patch({ venueName: e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field label={copy.ticketUrl}>
              <input
                value={v.ticketUrl}
                onChange={(e) => patch({ ticketUrl: e.target.value })}
                className={inputCls}
                placeholder="https://"
              />
            </Field>
            <Field label={copy.organizerName}>
              <input
                value={v.organizerName}
                onChange={(e) => patch({ organizerName: e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field label={copy.organizerPhone}>
              <input
                value={v.organizerPhone}
                onChange={(e) => patch({ organizerPhone: e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field label={copy.organizerEmail}>
              <input
                value={v.organizerEmail}
                onChange={(e) => patch({ organizerEmail: e.target.value })}
                className={inputCls}
                placeholder="name@example.com"
              />
            </Field>
          </div>
        </Section>
      )}
    </>
  );
}
