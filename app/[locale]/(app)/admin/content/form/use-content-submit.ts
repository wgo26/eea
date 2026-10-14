"use client";

import {
  createContentItem,
  saveContentItem,
} from "@/lib/admin/actions/content";
import { approveSubmissionWithContent } from "@/lib/admin/actions/moderation";
import { clearDraft, draftKey } from "@/lib/content/draft-autosave";
import { useAdminMutation } from "@/components/admin/confirm-dialog";
import type { Dictionary, Locale } from "@/lib/i18n";
import { payloadFromForm, type ContentType, type FormValues } from "./values";

type Copy = Dictionary["admin"]["content"];
type AddToast = (msg: string, type?: "success" | "error" | "info") => void;

/** The `run` handler from `useAdminMutation` (typed off the hook, not copied). */
export type SubmitRun = ReturnType<typeof useAdminMutation>["run"];

/**
 * The three write paths behind one form: edit-save, approve-with-claim,
 * create. Extracted from content-form.tsx verbatim — the submit handler is
 * pure orchestration over `payloadFromForm`, so it moves without behavior
 * change. Returns the `<form onSubmit>` handler.
 */
export function useContentSubmit(opts: {
  mode: "create" | "edit" | "approve";
  data?: { id: string; type: string } | null;
  approve?: { submissionId: string } | null;
  values: FormValues;
  type: ContentType;
  locale: Locale;
  copy: Copy;
  draftSlot: string | null;
  run: SubmitRun;
  addToast: AddToast;
  onDone: () => void;
}) {
  const { mode, data, approve, values: v, type, locale, copy, draftSlot, run, addToast, onDone } = opts;
  const isEdit = mode === "edit" && !!data;
  const isApprove = mode === "approve";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (isEdit && data) {
      // ---- save existing item (payload mirrors the old ContentEditForm) ----
      if (type === "listing" && v.price.trim() !== "" && Number.isNaN(Number(v.price))) {
        addToast(copy.priceLabel ?? "Enter a valid price.", "error");
        return;
      }
      const payload = payloadFromForm(v, data as Parameters<typeof payloadFromForm>[1]);
      if (payload.kind !== "save") return;
      const ok = await run(
        () => saveContentItem(payload.contentItemId, payload.draft, locale === 'fr' ? 'fr' : 'en'),
        copy.toastUpdated ?? "Saved.",
      );
      // The row now holds everything the autosave held, so the local copy is
      // stale by definition — leaving it would offer it back on next open.
      if (ok) clearDraft(draftKey(payload.contentItemId));
      if (ok) onDone();
      return;
    }

    // ---- approve a submission: same payload, plus the claim ---------------
    if (isApprove && approve) {
      const created = payloadFromForm(v, null);
      if (created.kind !== "create") return;
      const ok = await run(
        () =>
          approveSubmissionWithContent({
            submissionId: approve.submissionId,
            draft: created.input.draft,
            publish: created.input.publish,
            scheduledFor: created.input.scheduledFor,
            expiresAt: created.input.expiresAt,
          }),
        v.publish === "now"
          ? copy.approveToastPublished
          : v.publish === "schedule"
            ? copy.approveToastScheduled
            : copy.approveToastDraft,
      );
      if (ok) clearDraft(draftKey(draftSlot));
      if (ok) onDone();
      return;
    }

    // ---- create new item (payload mirrors the old ContentCreateDialog) ----
    if (v.publish === "schedule" && !v.scheduledFor.trim()) {
      addToast(copy.scheduledFor ?? "Pick a date/time first.", "error");
      return;
    }
    if (
      type === "listing" &&
      v.price.trim() !== "" &&
      Number.isNaN(Number(v.price))
    ) {
      addToast(copy.priceLabel ?? "Enter a valid price.", "error");
      return;
    }
    const created = payloadFromForm(v, null);
    if (created.kind !== "create") return;

    const toast =
      v.publish === "now"
        ? copy.toastPublished
        : v.publish === "schedule"
          ? copy.toastScheduled
          : (copy.toastCreated ?? copy.toastPublished);
    const ok = await run(() => createContentItem(created.input), toast);
    // A created row supersedes the local draft it was written from; for a new
    // item the key is the shared "new" slot, so clearing it also stops a blank
    // template being offered back as a recovery on the next post.
    if (ok) clearDraft(draftKey(null));
    if (ok) onDone();
  }

  return handleSubmit;
}
