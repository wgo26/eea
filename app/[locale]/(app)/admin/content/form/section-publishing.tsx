"use client";

import {
  PublishReadiness,
  type ReadinessCheck,
} from "@/components/admin/publish-readiness";
import { DialogFooter } from "@/components/ui/dialog";
import { ui, Field } from "@/lib/admin/ui-constants";
import type { Dictionary } from "@/lib/i18n";
import type { FormValues } from "./values";
import { Section } from "./shell";

type Copy = Dictionary["admin"]["content"];
type CommonCopy = Dictionary["admin"]["common"];

const inputCls = ui.input;
const btnPrimary = ui.btnPrimary;
const btnSecondary = ui.btnSecondary;
const btnGhost = ui.btnGhost;

/**
 * Section 7 — Publishing (modes/schedule for create; dates for edit) plus
 * the sticky footer dock (dirty state, discard/cancel, submit with readiness
 * gating and the Ctrl/Cmd+S shortcut hint).
 */
export function PublishingSection(props: {
  isEdit: boolean;
  isApprove: boolean;
  values: FormValues;
  patch: (p: Partial<FormValues>) => void;
  copy: Copy;
  common: CommonCopy;
  needsReadiness: boolean;
  readinessChecks: ReadinessCheck[];
  children?: React.ReactNode;
  loading: boolean;
  dirty: boolean;
  reset: () => void;
  onDone: () => void;
}) {
  const { isEdit, isApprove, values: v, patch, copy, common, needsReadiness, readinessChecks, children, loading, dirty, reset, onDone } = props;

  return (
    <>
      <Section title={copy.sectionPublishing}>
        {isEdit ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={copy.publishedAtLabel} hint={copy.publishedAtHint}>
              <input
                type="datetime-local"
                value={v.publishedAt}
                onChange={(e) => patch({ publishedAt: e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field label={`${copy.expiresAt} (${copy.optional})`}>
              <input
                type="date"
                value={v.expiresAt}
                onChange={(e) => patch({ expiresAt: e.target.value })}
                className={inputCls}
              />
            </Field>
          </div>
        ) : (
          <div className="grid gap-3 rounded-md border border-border bg-background p-3">
            <div role="radiogroup" aria-label={copy.publish} className="flex flex-wrap gap-2">
              {(["now", "schedule", "draft"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  role="radio"
                  aria-checked={v.publish === mode}
                  onClick={() => patch({ publish: mode })}
                  className={`inline-flex items-center rounded-md px-3 py-1.5 text-xs font-medium border transition-colors ${
                    v.publish === mode
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {mode === "now"
                    ? copy.publishNow
                    : mode === "schedule"
                      ? copy.publishSchedule
                      : copy.publishDraft}
                </button>
              ))}
            </div>
            {v.publish === "schedule" && (
              <Field label={copy.scheduledFor}>
                <input
                  type="datetime-local"
                  value={v.scheduledFor}
                  onChange={(e) => patch({ scheduledFor: e.target.value })}
                  required
                  className={inputCls}
                />
              </Field>
            )}
            <Field label={`${copy.expiresAt} (${copy.optional})`}>
              <input
                type="date"
                value={v.expiresAt}
                onChange={(e) => patch({ expiresAt: e.target.value })}
                className={inputCls}
              />
            </Field>
          </div>
        )}
        {needsReadiness && <PublishReadiness copy={copy} checks={readinessChecks} />}
      </Section>

      {children}

      <DialogFooter className="sticky bottom-0 z-10 -mx-6 -mb-6 mt-1 border-t border-border bg-popover px-6 pb-6 pt-3">
        <div className="flex w-full items-center justify-between gap-3">
          <span className="flex items-center gap-2" aria-live="polite">
            {loading ? (
              <span className="text-xs text-muted-foreground">{common.working}</span>
            ) : dirty ? (
              <>
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden />
                <span className="text-xs text-muted-foreground">{common.dirty}</span>
              </>
            ) : isEdit ? (
              <span className="text-xs text-muted-foreground">{common.dockSaved}</span>
            ) : null}
          </span>
          <span className="flex items-center gap-2">
            {dirty && (
              <button type="button" onClick={reset} disabled={loading} className={btnGhost}>
                {common.discard}
              </button>
            )}
            <button type="button" onClick={onDone} className={btnSecondary} disabled={loading}>
              {common.cancel}
            </button>
            <button
              type="submit"
              className={btnPrimary}
              disabled={
                loading ||
                !v.enTitle.trim() ||
                (needsReadiness && readinessChecks.some((c) => !c.passed))
              }
              title={common.shortcutsHint}
            >
              {loading
                ? common.working
                : isEdit
                  ? copy.saveChanges
                  : v.publish === "now"
                    ? isApprove
                      ? copy.approvePublish
                      : copy.createPublish
                    : v.publish === "schedule"
                      ? isApprove
                        ? copy.approveSchedule
                        : copy.createSchedule
                      : isApprove
                        ? copy.approveDraft
                        : copy.createDraft}
            </button>
          </span>
        </div>
      </DialogFooter>
    </>
  );
}
