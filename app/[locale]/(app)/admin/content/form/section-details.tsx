"use client";

import {
  useContentTranslator,
  TranslateButtons,
} from "@/components/admin/translate-buttons";
import { ContentAssistButtons } from "@/components/admin/content-assist-buttons";
import { ui, Field } from "@/lib/admin/ui-constants";
import type { Dictionary } from "@/lib/i18n";
import {
  BilingualHeadings,
  BilingualExcerpts,
} from "../bilingual-fields";
import {
  CONTENT_TYPES,
  TYPE_DICT_KEYS,
  type ContentType,
  type FormValues,
} from "./values";
import { Section } from "./shell";
import { useContentAssist } from "./assist";

type Copy = Dictionary["admin"]["content"];
type TypeFilters = Dictionary["admin"]["typeFilters"];

const inputCls = ui.input;
const btnSecondary = ui.btnSecondary;
const btnGhost = ui.btnGhost;

export type DetailsAssist = ReturnType<typeof useContentAssist>;
export type Translate = ReturnType<typeof useContentTranslator>;

/**
 * Section 1 — Details: type (select, or locked fact in approve mode),
 * bilingual titles + excerpts, translate + assist buttons, headline options,
 * verification suggestion. The reviewer's first impression; unchanged behavior.
 */
export function DetailsSection(props: {
  isEdit: boolean;
  isApprove: boolean;
  unmappedKeys: string[];
  values: FormValues;
  patch: (p: Partial<FormValues>) => void;
  copy: Copy;
  typeFilters: TypeFilters;
  translate: Translate["translate"];
  translating: Translate["translating"];
  assist: DetailsAssist["assist"];
  aiEnabled: boolean;
  aiModel: DetailsAssist["aiModel"];
  aiBudget: DetailsAssist["aiBudget"];
  handleDraftAi: DetailsAssist["handleDraftAi"];
  draftingAi: boolean;
  lastDraft: DetailsAssist["lastDraft"];
  describeFields: DetailsAssist["describeFields"];
  undoLastDraft: DetailsAssist["undoLastDraft"];
  headlines: DetailsAssist["headlines"];
  setHeadlines: DetailsAssist["setHeadlines"];
  handleHeadlines: DetailsAssist["handleHeadlines"];
  headlinesWorking: DetailsAssist["headlinesWorking"];
  verifyState: DetailsAssist["verifyState"];
  setVerifyState: DetailsAssist["setVerifyState"];
  handleVerify: DetailsAssist["handleVerify"];
  verifyWorking: DetailsAssist["verifyWorking"];
  addToast: (msg: string, type?: "success" | "error" | "info") => void;
}) {
  const {
    isEdit,
    isApprove,
    unmappedKeys,
    values: v,
    patch,
    copy,
    typeFilters,
    translate,
    translating,
    assist,
    aiEnabled,
    aiModel,
    aiBudget,
    handleDraftAi,
    draftingAi,
    lastDraft,
    describeFields,
    undoLastDraft,
    headlines,
    setHeadlines,
    handleHeadlines,
    headlinesWorking,
    verifyState,
    setVerifyState,
    handleVerify,
    verifyWorking,
    addToast,
  } = props;

  return (
    <Section title={copy.sectionDetails}>
      {!isEdit &&
        (isApprove ? (
          // The content type is decided by the submission, not the reviewer:
          // approveSubmissionWithContent derives it from
          // SUBMISSION_TO_CONTENT and the server has the last word. Showing a
          // live select here would let someone pick a type the post could not
          // become, so it reads as a fixed fact.
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{copy.type}:</span>
            <span className="font-medium text-foreground">
              {typeFilters[TYPE_DICT_KEYS[v.type]] ?? v.type}
            </span>
          </div>
        ) : (
          <Field label={copy.type}>
            <select
              value={v.type}
              onChange={(e) =>
                patch({
                  type: e.target.value as ContentType,
                  categoryId: "",
                })
              }
              className={inputCls}
            >
              {CONTENT_TYPES.map((ct) => (
                <option key={ct} value={ct}>
                  {typeFilters[TYPE_DICT_KEYS[ct]] ?? ct}
                </option>
              ))}
            </select>
          </Field>
        ))}
      {isApprove && unmappedKeys.length ? (
        // Nothing in a submission may vanish quietly: the reviewer is told
        // which keys the form could not place, and reads them in the
        // submitted-content panel beside the form.
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-800 dark:text-amber-300">
          {copy.unmappedNotice.replace("{keys}", unmappedKeys.join(", "))}
        </p>
      ) : null}
      <BilingualHeadings
        copy={copy}
        enTitle={v.enTitle}
        frTitle={v.frTitle}
        onTitle={(locale, val) =>
          patch(locale === "en" ? { enTitle: val } : { frTitle: val })
        }
        required={!isEdit}
        showHint={!isEdit && v.publish !== "draft"}
      />
      <TranslateButtons
        copy={copy}
        translate={translate}
        translating={translating}
      />
      {copy.translateHint ? (
        <p className="text-xs text-muted-foreground">{copy.translateHint}</p>
      ) : null}
      <ContentAssistButtons
        copy={copy}
        {...assist}
        aiEnabled={aiEnabled}
        aiModel={aiModel}
        aiBudget={aiBudget}
        onDraftAi={handleDraftAi}
        draftingAi={draftingAi}
      />
      {lastDraft && lastDraft.fields.length > 0 ? (
        // Provenance, reviewable: which fields the last pass wrote and with
        // what engine — plus a one-tap undo that restores the prior values.
        <div
          role="status"
          className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/40 px-2.5 py-1.5 text-xs"
        >
          <span className="text-muted-foreground">
            {(copy.assistLastDraft ?? '{engine} drafted: {fields}')
              .replace(
                '{engine}',
                lastDraft.engine === 'llm'
                  ? (copy.assistEngineAi as string | undefined) ?? 'AI'
                  : (copy.assistEngineOffline as string | undefined) ?? 'Offline',
              )
              .replace('{fields}', describeFields(lastDraft.fields).join(', '))}
          </span>
          <button
            type="button"
            onClick={undoLastDraft}
            className="shrink-0 rounded-md border border-border px-2 py-0.5 font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {copy.assistUndo ?? 'Undo drafting pass'}
          </button>
        </div>
      ) : null}
      {/* P2 — AI headline options (EN/FR pickers, apply-on-tap). */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void handleHeadlines("en")}
          disabled={!aiEnabled || headlinesWorking !== null}
          className={btnSecondary}
          title={aiEnabled ? undefined : (copy.assistAiOff as string | undefined)}
        >
          {headlinesWorking === "en" ? (copy.assistHeadlinesWorking as string) : `${copy.assistHeadlines as string} EN`}
        </button>
        <button
          type="button"
          onClick={() => void handleHeadlines("fr")}
          disabled={!aiEnabled || headlinesWorking !== null}
          className={btnSecondary}
          title={aiEnabled ? undefined : (copy.assistAiOff as string | undefined)}
        >
          {headlinesWorking === "fr" ? (copy.assistHeadlinesWorking as string) : `${copy.assistHeadlines as string} FR`}
        </button>
        <button
          type="button"
          onClick={() => void handleVerify()}
          disabled={!aiEnabled || verifyWorking}
          className={btnSecondary}
          title={aiEnabled ? undefined : (copy.assistAiOff as string | undefined)}
        >
          {verifyWorking ? (copy.assistVerifyWorking as string) : (copy.assistVerify as string)}
        </button>
      </div>
      {headlines ? (
        <div role="status" className="grid gap-1.5 rounded-md border border-border bg-muted/40 p-2.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            AI headlines · {headlines.locale.toUpperCase()}
          </p>
          {headlines.items.map((h) => (
            <div key={h} className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{h}</span>
              <button
                type="button"
                className={btnGhost}
                onClick={() => {
                  patch(headlines.locale === "en" ? { enTitle: h } : { frTitle: h });
                  addToast(`${copy.toastAssisted ?? copy.toastTranslated} (AI · headline)`, "success");
                }}
              >
                {copy.assistApplyHeadline as string}
              </button>
            </div>
          ))}
          <button type="button" className="justify-self-start text-xs text-muted-foreground hover:text-foreground" onClick={() => setHeadlines(null)}>
            ×
          </button>
        </div>
      ) : null}
      {verifyState ? (
        <div role="status" className="grid gap-1.5 rounded-md border border-border bg-muted/40 p-2.5 text-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            AI verification · {verifyState.badge}
          </p>
          {verifyState.reasons.map((r) => (
            <p key={r} className="text-xs text-muted-foreground">• {r}</p>
          ))}
          {verifyState.checklist.map((c) => (
            <p key={c} className="text-xs">☐ {c}</p>
          ))}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={btnSecondary}
              onClick={() => {
                patch({ verification: verifyState.badge });
                addToast(`${copy.toastAssisted ?? copy.toastTranslated} (AI · verification)`, "success");
              }}
            >
              {copy.assistVerifyApply as string}: {verifyState.badge}
            </button>
            <button type="button" className={btnGhost} onClick={() => setVerifyState(null)}>
              ×
            </button>
          </div>
        </div>
      ) : null}
      <BilingualExcerpts
        copy={copy}
        enExcerpt={v.enExcerpt}
        frExcerpt={v.frExcerpt}
        onExcerpt={(locale, val) =>
          patch(locale === "en" ? { enExcerpt: val } : { frExcerpt: val })
        }
      />
    </Section>
  );
}
