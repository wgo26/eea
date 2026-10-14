"use client";

import { ui, Field } from "@/lib/admin/ui-constants";
import type { Dictionary } from "@/lib/i18n";
import { BilingualSeo } from "../bilingual-fields";
import type { FormValues } from "./values";
import { Section } from "./shell";
import { useContentAssist } from "./assist";

type Copy = Dictionary["admin"]["content"];
type AddToast = (msg: string, type?: "success" | "error" | "info") => void;

const inputCls = ui.input;
const btnSecondary = ui.btnSecondary;
const btnGhost = ui.btnGhost;

/**
 * Sections 6 + 6b — SEO & sharing (permalink, meta descriptions, WhatsApp
 * line, voice) and P5 Distribution repurpose (one story → every surface,
 * apply-on-tap with copy buttons).
 */
export function SeoSection(props: {
  values: FormValues;
  patch: (p: Partial<FormValues>) => void;
  markTouched: (field: string) => void;
  copy: Copy;
  isEdit: boolean;
  aiEnabled: boolean;
  repurpose: ReturnType<typeof useContentAssist>["repurpose"];
  repurposeWorking: boolean;
  handleRepurpose: ReturnType<typeof useContentAssist>["handleRepurpose"];
  addToast: AddToast;
}) {
  const { values: v, patch, markTouched, copy, isEdit, aiEnabled, repurpose, repurposeWorking, handleRepurpose, addToast } = props;

  return (
    <>
      {/* 6 — SEO & sharing: permalink, meta descriptions, WhatsApp line. */}
      <Section title={copy.sectionSeo}>
        <Field label={copy.slugLabel} hint={copy.slugHint}>
          <input
            value={v.slug}
            onChange={(e) => {
              // Claiming the slug stops the title from re-deriving it; the
              // auto-fill only ever fills a slug nobody has touched.
              markTouched("slug");
              patch({ slug: e.target.value });
            }}
            className={inputCls}
            placeholder={isEdit ? undefined : "my-story-slug"}
          />
        </Field>
        <BilingualSeo
          copy={copy}
          enSeo={v.enSeo}
          frSeo={v.frSeo}
          onSeo={(locale, val) =>
            patch(locale === "en" ? { enSeo: val } : { frSeo: val })
          }
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={copy.shareTextLabel} hint={copy.shareTextHint}>
            <input
              value={v.shareText}
              onChange={(e) => patch({ shareText: e.target.value })}
              maxLength={280}
              className={inputCls}
            />
          </Field>
          <Field label={copy.voiceLabel}>
            <select
              value={v.voiceType}
              onChange={(e) => patch({ voiceType: e.target.value })}
              className={inputCls}
            >
              <option value="">—</option>
              <option value="formal">formal</option>
              <option value="pidgin">pidgin</option>
              <option value="camfranglais">camfranglais</option>
            </select>
          </Field>
        </div>
      </Section>

      {/* 6b — P5 Distribution: one story → every surface (apply-on-tap). */}
      <Section title={copy.repurposeTitle as string}>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void handleRepurpose()}
            disabled={!aiEnabled || repurposeWorking}
            className={btnSecondary}
            title={aiEnabled ? undefined : (copy.assistAiOff as string | undefined)}
          >
            {repurposeWorking ? (copy.repurposeWorking as string) : (copy.repurposeRun as string)}
          </button>
        </div>
        {repurpose ? (
          <div className="grid gap-2">
            {(
              [
                ["whatsapp", copy.repurposeWhatsapp],
                ["social", copy.repurposeSocial],
                ["micro", copy.repurposeMicro],
                ["pidgin", copy.repurposePidgin],
                ["emailSubject", copy.repurposeSubject],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="rounded-md border border-border bg-muted/40 p-2.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label as string}</p>
                <p className="mt-1 text-sm">{repurpose[key]}</p>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={btnGhost}
                    onClick={() => {
                      void navigator.clipboard?.writeText(repurpose[key]);
                      addToast(copy.repurposeCopy as string, "success");
                    }}
                  >
                    {copy.repurposeCopy as string}
                  </button>
                  {key === "whatsapp" || key === "pidgin" ? (
                    <button
                      type="button"
                      className={btnGhost}
                      onClick={() => {
                        patch({ shareText: repurpose[key].slice(0, 280) });
                        addToast(`${copy.toastAssisted ?? copy.toastTranslated} (AI · repurpose)`, "success");
                      }}
                    >
                      {copy.repurposeApplyShare as string}
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </Section>
    </>
  );
}
