'use client'

/**
 * The content form's intelligence layer: AI status, the one-click drafters,
 * headline / verification / repurpose co-pilots, and the derived-field effect.
 *
 * Extracted verbatim from content-form.tsx so the moderation approve form gets
 * the same help an editor has — turning a citizen's raw payload into a
 * publishable bilingual story is where drafting assistance matters most, and
 * the review screen shipped with none of it.
 *
 * Auto-apply policy (see lib/admin/actions/ai.ts): AI writes into the FORM for
 * review, never straight to a published row. Category / location / verification
 * stay confidence-gated suggestions that need a human tap.
 */
import { useEffect, useState } from 'react'
import type { Dictionary } from '@/lib/i18n'
import {
  aiClassifySuggest,
  aiDraftRemaining,
  aiHeadlines,
  aiImageAlt,
  aiRepurpose,
  aiTagsSuggest,
  aiVerification,
  getAiStatus,
} from '@/lib/admin/actions/ai'
import { draftShareInto } from '@/components/admin/share-drafter'
import {
  draftRemainingFields,
  suggestAltFromCaption,
  suggestCategory,
  suggestCredit,
  suggestExcerpt,
  suggestLocation,
  suggestSeoDescription,
  suggestSlug,
  suggestTags,
  type AutoFillField,
} from '@/lib/content/auto-fill'
import type { FormValues } from './values'

type Copy = Dictionary['admin']['content']
type Option = { id: string; name: string; slug?: string }
type AddToast = (msg: string, type?: 'success' | 'error' | 'info') => void

export type ContentAssistOptions = {
  values: FormValues
  patch: (p: Partial<FormValues>) => void
  copy: Copy
  addToast: AddToast
  locations: Option[]
  categoryOptions: Option[]
  touched: ReadonlySet<string>
  markTouched: (field: string) => void
  /** Create mode only: an edit never re-derives a stored row. */
  isEdit: boolean
}

export function useContentAssist(opts: ContentAssistOptions) {
  const {
    values: v,
    patch,
    copy,
    addToast,
    locations,
    categoryOptions,
    touched,
    markTouched,
    isEdit,
  } = opts

  // Honest intelligence-layer status: offline smart fill vs real LLM.
  // Fetched once per mount; failure = offline (never blocks the form).
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiModel, setAiModel] = useState<string | undefined>(undefined);
  const [aiBudget, setAiBudget] = useState<{ used: number; budget: number } | null>(null);
  const [draftingAi, setDraftingAi] = useState(false);
  /**
   * Provenance for the last drafting pass: which fields were written, by which
   * engine, and the values they replaced — so the editor can review what the
   * pass did and undo it in one tap instead of trusting a transient toast.
   */
  const [lastDraft, setLastDraft] = useState<{
    fields: string[];
    engine: 'llm' | 'offline';
    snapshot: Partial<FormValues>;
  } | null>(null);
  /**
   * Confidence-gated taxonomy suggestion awaiting a human tap. The policy says
   * category / location ALWAYS require one below 0.6 confidence — previously
   * that suggestion lived in a toast that vanished; now it renders as a chip
   * with its rationale until applied or dismissed.
   */
  const [suggestion, setSuggestion] = useState<{
    kind: 'category' | 'location';
    id: string;
    name: string;
    confidence: number;
    rationale: string;
  } | null>(null);
  // P2 co-pilot state: headline options, verification suggestion, alt progress.
  const [headlines, setHeadlines] = useState<{ locale: "en" | "fr"; items: string[] } | null>(null);
  const [headlinesWorking, setHeadlinesWorking] = useState<null | "en" | "fr">(null);
  const [verifyState, setVerifyState] = useState<{
    badge: string;
    reasons: string[];
    checklist: string[];
  } | null>(null);
  const [verifyWorking, setVerifyWorking] = useState(false);
  const [altWorking, setAltWorking] = useState(false);
  // P5 repurpose engine: one story → every surface.
  const [repurpose, setRepurpose] = useState<{
    whatsapp: string;
    social: string;
    micro: string;
    pidgin: string;
    emailSubject: string;
  } | null>(null);
  const [repurposeWorking, setRepurposeWorking] = useState(false);

  async function handleRepurpose() {
    if (repurposeWorking) return;
    const title = v.enTitle || v.frTitle;
    const body = v.enBody || v.frBody;
    if (!title.trim() && !body.trim()) {
      addToast(copy.translateEmpty, "error");
      return;
    }
    setRepurposeWorking(true);
    try {
      const res = await aiRepurpose({
        title,
        excerpt: v.enExcerpt || v.frExcerpt || "",
        body,
        locale: v.frTitle && !v.enTitle ? "fr" : "en",
      });
      if (!res.ok) {
        addToast(res.error, "error");
        return;
      }
      setRepurpose({
        whatsapp: res.whatsapp,
        social: res.social,
        micro: res.micro,
        pidgin: res.pidgin,
        emailSubject: res.emailSubject,
      });
      addToast(`${copy.toastAssisted ?? copy.toastTranslated} (AI · repurpose)`, "success");
    } catch (e) {
      addToast(e instanceof Error ? e.message : "Repurpose failed.", "error");
    } finally {
      setRepurposeWorking(false);
    }
  }
  useEffect(() => {
    getAiStatus()
      .then((s) => {
        setAiEnabled(s.enabled);
        setAiModel(s.configured ? s.model : undefined);
        if (typeof s.tokensUsedToday === 'number' && typeof s.budgetTokensDay === 'number') {
          setAiBudget({ used: s.tokensUsedToday, budget: s.budgetTokensDay });
        }
      })
      .catch(() => {
        setAiEnabled(false);
      });
  }, []);

  /** Human-readable field names for the provenance chip (raw keys leak internals). */
  function describeFields(keys: string[]): string[] {
    return keys.map((k) =>
      k
        .replace(/^en|^fr/, '')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .trim()
        .toLowerCase() || k,
    );
  }

  /** Capture current values for the keys about to be patched, for undo. */
  function snapshotOf(keys: string[]): Partial<FormValues> {
    const snap: Record<string, unknown> = {};
    for (const k of keys) snap[k] = (v as unknown as Record<string, unknown>)[k];
    return snap as Partial<FormValues>;
  }

  function undoLastDraft() {
    if (!lastDraft) return;
    patch(lastDraft.snapshot);
    setLastDraft(null);
    addToast(copy.assistUndone ?? 'Drafting pass undone.', 'success');
  }

  function applySuggestion() {
    if (!suggestion) return;
    if (suggestion.kind === 'category') {
      patch({ categoryId: suggestion.id });
      markTouched('categoryId');
    } else {
      patch({ locationId: suggestion.id });
      markTouched('locationId');
    }
    setSuggestion(null);
    addToast(copy.toastAssisted ?? copy.toastTranslated, 'success');
  }

  async function handleDraftAi() {
    if (draftingAi) return;
    // Cost honesty: never spend tokens on an empty source — the server would
    // reject it anyway, and the reviewer learns nothing from the round trip.
    if (!v.enTitle.trim() && !v.frTitle.trim() && !v.enBody.trim() && !v.frBody.trim()) {
      addToast(copy.translateEmpty, 'error');
      return;
    }
    setDraftingAi(true);
    try {
      const res = await aiDraftRemaining({
        enTitle: v.enTitle,
        frTitle: v.frTitle,
        enBody: v.enBody,
        frBody: v.frBody,
        skip: [...touched] as string[],
        categories: categoryOptions,
        locations,
        knownTags: v.tags.split(",").map((t) => t.trim()).filter(Boolean),
        voice: v.voiceType || "formal",
      });
      if (!res.ok) {
        // Offline / budget / kill-switch: fall back to deterministic pass so
        // one click still does something useful, and say which engine ran.
        const fallback = draftRemainingFields({
          type: v.type,
          enTitle: v.enTitle,
          frTitle: v.frTitle,
          enBody: v.enBody,
          frBody: v.frBody,
          enExcerpt: v.enExcerpt,
          frExcerpt: v.frExcerpt,
          enSeo: v.enSeo,
          frSeo: v.frSeo,
          slug: v.slug,
          tags: v.tags,
          shareText: v.shareText,
          categoryId: v.categoryId,
          locationId: v.locationId,
          authorName: v.authorName,
          categories: categoryOptions,
          locations,
          touched: touched as ReadonlySet<AutoFillField>,
        });
        if (fallback.applied.length > 0) patch(fallback.patch);
        if (fallback.applied.length > 0) {
          setLastDraft({ fields: [...fallback.applied], engine: 'offline', snapshot: snapshotOf(fallback.applied) });
        }
        addToast(`${res.error} — offline fill applied instead.`, "info");
        return;
      }
      // Auto-apply policy: Tier 1 writes empty form fields (review-before-save);
      // category/location only arrive here when confidence >= 0.6, else notes.
      const appliedKeys = Object.keys(res.patch);
      setLastDraft({ fields: appliedKeys, engine: 'llm', snapshot: snapshotOf(appliedKeys) });
      patch(res.patch as Partial<FormValues>);
      const n = Object.keys(res.patch).length;
      const suffix = res.notes.length > 0 ? ` ${res.notes.join(" ")}` : "";
      addToast(`AI drafted ${n} field(s) (AI · ${aiModel ?? "llm"}) — review before saving.${suffix}`, "success");
    } catch (e) {
      addToast(e instanceof Error ? e.message : "AI draft failed.", "error");
    } finally {
      setDraftingAi(false);
    }
  }

  async function handleHeadlines(target: "en" | "fr") {
    if (headlinesWorking) return;
    const topic = target === "en" ? v.enTitle || v.frTitle : v.frTitle || v.enTitle;
    const body = target === "en" ? v.enBody || v.frBody : v.frBody || v.enBody;
    if (!topic.trim() && !body.trim()) {
      addToast(copy.translateEmpty, "error");
      return;
    }
    setHeadlinesWorking(target);
    try {
      const res = await aiHeadlines({ topic, body, locale: target });
      if (!res.ok || !("headlines" in res) || !res.headlines?.length) {
        addToast(res.ok ? copy.translateEmpty : res.error, "error");
        return;
      }
      setHeadlines({ locale: target, items: res.headlines.slice(0, 3) });
      addToast(`${copy.toastAssisted ?? copy.toastTranslated} (AI · headlines ${target.toUpperCase()})`, "success");
    } catch (e) {
      addToast(e instanceof Error ? e.message : "AI headlines failed.", "error");
    } finally {
      setHeadlinesWorking(null);
    }
  }

  async function handleVerify() {
    if (verifyWorking) return;
    const title = v.enTitle || v.frTitle;
    const body = v.enBody || v.frBody;
    if (!title.trim() && !body.trim()) {
      addToast(copy.translateEmpty, "error");
      return;
    }
    setVerifyWorking(true);
    try {
      const res = await aiVerification({ title, body });
      if (!res.ok) {
        addToast(res.error, "error");
        return;
      }
      setVerifyState({ badge: res.badge, reasons: res.reasons.slice(0, 4), checklist: res.checklist.slice(0, 6) });
      addToast(`${copy.toastAssisted ?? copy.toastTranslated} (AI · verification)`, "success");
    } catch (e) {
      addToast(e instanceof Error ? e.message : "AI verification failed.", "error");
    } finally {
      setVerifyWorking(false);
    }
  }

  // Assist handlers — shared, was duplicated verbatim in both dialogs.
  const assist = {
    onExcerpt: () => {
      // Per-locale drafting: French fields take French prose only.
      const enS = suggestExcerpt(v.enBody);
      const frS = suggestExcerpt(v.frBody);
      if (!enS && !frS) return addToast(copy.translateEmpty, "error");
      patch({
        enExcerpt: v.enExcerpt.trim() ? v.enExcerpt : enS || v.enExcerpt,
        frExcerpt: v.frExcerpt.trim() ? v.frExcerpt : frS || v.frExcerpt,
      });
      addToast(copy.toastAssisted ?? copy.toastTranslated, "success");
    },
    onSeo: () => {
      const enS = suggestSeoDescription(v.enTitle, v.enExcerpt || v.enBody);
      const frS = v.frTitle || v.frBody ? suggestSeoDescription(v.frTitle, v.frExcerpt || v.frBody) : "";
      if (!enS && !frS) return addToast(copy.translateEmpty, "error");
      patch({
        enSeo: v.enSeo.trim() ? v.enSeo : enS || v.enSeo,
        frSeo: v.frSeo.trim() ? v.frSeo : frS || v.frSeo,
      });
      addToast(copy.toastAssisted ?? copy.toastTranslated, "success");
    },
    onTags: () => {
      const existing = v.tags.split(",").map((t) => t.trim()).filter(Boolean);
      // AI-first: entity extraction mapped to the site vocabulary; offline
      // keyword counting stays the instant fallback (and the path when AI off).
      if (aiEnabled) {
        void (async () => {
          try {
            const res = await aiTagsSuggest({
              title: `${v.enTitle} ${v.frTitle}`.trim(),
              body: `${v.enBody} ${v.frBody}`.trim(),
              existing,
            });
            if (res.ok && "tags" in res && res.tags?.length) {
              patch({ tags: [...existing, ...res.tags].join(", ") });
              const suffix =
                "places" in res && res.places?.length ? ` — places: ${res.places.join(", ")}` : "";
              addToast(`${copy.toastAssisted ?? copy.toastTranslated} (AI · entities)${suffix}`, "success");
              return;
            }
          } catch {
            /* fall through to offline */
          }
          const s = suggestTags(`${v.enTitle} ${v.frTitle}`, `${v.enBody} ${v.frBody}`, existing);
          if (s.length === 0) {
            addToast(copy.translateEmpty, "error");
            return;
          }
          patch({ tags: [...existing, ...s].join(", ") });
          addToast(`${copy.toastAssisted ?? copy.toastTranslated} (offline)`, "success");
        })();
        return;
      }
      const s = suggestTags(
        `${v.enTitle} ${v.frTitle}`,
        `${v.enBody} ${v.frBody}`,
        existing,
      );
      if (s.length === 0) {
        addToast(copy.translateEmpty, "error");
        return;
      }
      patch({ tags: [...existing, ...s].join(", ") });
      addToast(`${copy.toastAssisted ?? copy.toastTranslated} (offline)`, "success");
    },
    onSlug: () => {
      patch({ slug: suggestSlug(v.enTitle || v.frTitle) });
      addToast(copy.toastAssisted ?? copy.toastTranslated, "success");
    },
    onShare: () => {
      void draftShareInto({
        title: v.enTitle || v.frTitle,
        excerpt: v.enExcerpt || v.frExcerpt || "",
        voice: v.voiceType || "formal",
        locale: v.frTitle && !v.enTitle ? "fr" : "en",
        enExcerpt: v.enExcerpt,
        enBody: v.enBody,
      }, copy, patch, addToast);
    },    /**
     * One pass over every derived field the editor left empty — the collapse of
     * the five ✨ buttons above. Category / location are included, which is what
     * deletes two of the publish-readiness gates entirely.
     */
    onDraftAll: () => {
      const result = draftRemainingFields({
        type: v.type,
        enTitle: v.enTitle,
        frTitle: v.frTitle,
        enBody: v.enBody,
        frBody: v.frBody,
        enExcerpt: v.enExcerpt,
        frExcerpt: v.frExcerpt,
        enSeo: v.enSeo,
        frSeo: v.frSeo,
        slug: v.slug,
        tags: v.tags,
        shareText: v.shareText,
        categoryId: v.categoryId,
        locationId: v.locationId,
        authorName: v.authorName,
        categories: categoryOptions,
        locations,
        touched: touched as ReadonlySet<AutoFillField>,
      });
      if (result.applied.length === 0) {
        addToast(
          result.unresolved.length > 0 ? copy.assistUnsure : copy.assistNothingToDo,
          result.unresolved.length > 0 ? "error" : "success",
        );
        return;
      }
      patch(result.patch);
      setLastDraft({ fields: [...result.applied], engine: 'offline', snapshot: snapshotOf(result.applied) });
      addToast(
        result.unresolved.length > 0
          ? copy.assistUnsure
          : copy.assistDraftedCount.replace("{n}", String(result.applied.length)),
        result.unresolved.length > 0 ? "error" : "success",
      );
    },
    onCategory: () => {
      // Cost honesty: an empty source cannot classify — say so before any call.
      if (!(`${v.enTitle} ${v.frTitle}`.trim()) && !(`${v.enBody} ${v.frBody}`.trim())) {
        addToast(copy.translateEmpty, "error");
        return;
      }
      // AI-first with confidence gate: >=0.6 auto-applies, below stays a
      // suggestion toast; offline word-match is the fallback.
      if (aiEnabled && categoryOptions.length > 0) {
        void (async () => {
          try {
            const res = await aiClassifySuggest({
              title: v.enTitle || v.frTitle,
              body: v.enBody || v.frBody,
              categories: categoryOptions,
              locations,
            });
            if (res.ok && "categoryId" in res && res.categoryId) {
              if (res.confidence >= 0.6) {
                patch({ categoryId: res.categoryId });
                markTouched("categoryId");
                addToast(
                  `${copy.toastAssisted ?? copy.toastTranslated} (AI · ${Math.round(res.confidence * 100)}%)`,
                  "success",
                );
                return;
              }
              // Below the confidence gate the policy forbids silent auto-apply:
              // surface a tappable chip with the rationale instead of a toast.
              const rationale = "rationale" in res && typeof res.rationale === 'string' ? res.rationale.slice(0, 200) : '';
              const name = categoryOptions.find((c) => c.id === (res as { categoryId: string }).categoryId)?.name
                ?? (res as { categoryId: string }).categoryId;
              setSuggestion({
                kind: 'category',
                id: (res as { categoryId: string }).categoryId,
                name,
                confidence: res.confidence,
                rationale,
              });
              addToast(
                `${rationale ? `${rationale} ` : ''}${copy.assistUnsure}`,
                "error",
              );
              return;
            }
          } catch {
            /* fall through to offline */
          }
          const s = suggestCategory(v.enTitle || v.frTitle, v.enBody || v.frBody, categoryOptions);
          if (!s) {
            addToast(`${copy.assistUnsure} (offline)`, "error");
            return;
          }
          patch({ categoryId: s.id });
          markTouched("categoryId");
          addToast(`${copy.toastAssisted ?? copy.toastTranslated} (offline)`, "success");
        })();
        return;
      }
      const s = suggestCategory(v.enTitle || v.frTitle, v.enBody || v.frBody, categoryOptions);
      if (!s) {
        addToast(`${copy.assistUnsure} (offline)`, "error");
        return;
      }
      patch({ categoryId: s.id });
      markTouched("categoryId");
      addToast(`${copy.toastAssisted ?? copy.toastTranslated} (offline)`, "success");
    },
    onLocation: () => {
      // Cost honesty: an empty source cannot classify — say so before any call.
      if (!(`${v.enTitle} ${v.frTitle}`.trim()) && !(`${v.enBody} ${v.frBody}`.trim())) {
        addToast(copy.translateEmpty, "error");
        return;
      }
      if (aiEnabled && locations.length > 0) {
        void (async () => {
          try {
            const res = await aiClassifySuggest({
              title: v.enTitle || v.frTitle,
              body: v.enBody || v.frBody,
              categories: categoryOptions,
              locations,
            });
            if (res.ok && "locationId" in res && res.locationId) {
              if (res.confidence >= 0.6) {
                patch({ locationId: res.locationId });
                markTouched("locationId");
                addToast(
                  `${copy.toastAssisted ?? copy.toastTranslated} (AI · ${Math.round(res.confidence * 100)}%)`,
                  "success",
                );
                return;
              }
              // Below the confidence gate: tappable chip with rationale, not a toast.
              const rationale = "rationale" in res && typeof res.rationale === 'string' ? res.rationale.slice(0, 200) : '';
              const name = locations.find((l) => l.id === (res as { locationId: string }).locationId)?.name
                ?? (res as { locationId: string }).locationId;
              setSuggestion({
                kind: 'location',
                id: (res as { locationId: string }).locationId,
                name,
                confidence: res.confidence,
                rationale,
              });
              addToast(
                `${rationale ? `${rationale} ` : ''}${copy.assistUnsure}`,
                "error",
              );
              return;
            }
          } catch {
            /* fall through to offline */
          }
          const s = suggestLocation(v.enTitle || v.frTitle, v.enBody || v.frBody, locations);
          if (!s) {
            addToast(`${copy.assistUnsure} (offline)`, "error");
            return;
          }
          patch({ locationId: s.id });
          markTouched("locationId");
          addToast(`${copy.toastAssisted ?? copy.toastTranslated} (offline)`, "success");
        })();
        return;
      }
      const s = suggestLocation(v.enTitle || v.frTitle, v.enBody || v.frBody, locations);
      if (!s) {
        addToast(`${copy.assistUnsure} (offline)`, "error");
        return;
      }
      patch({ locationId: s.id });
      markTouched("locationId");
      addToast(`${copy.toastAssisted ?? copy.toastTranslated} (offline)`, "success");
    },
    /**
     * Fills alt text on every photo that lacks it, and the post credit from the
     * byline. These were the two fields the form collected but never drafted,
     * so an image-first story could publish with blank accessibility metadata.
     */
    onAlt: () => {
      const title = v.enTitle || v.frTitle;
      // AI-first vision pass: describe each photo missing alt via the vision
      // model; per-photo fallback stays the offline caption/filename heuristic
      // so one vision failure never blocks the other 19 photos.
      if (aiEnabled) {
        const missing = v.newPhotos.filter(
          (p) => !p.alt?.trim() && p.kind !== "video" && p.kind !== "audio" && p.url.startsWith("http"),
        );
        if (missing.length > 0 && !altWorking) {
          setAltWorking(true);
          void (async () => {
            try {
              const next = [...v.newPhotos];
              let aiCount = 0;
              for (let i = 0; i < next.length; i++) {
                const p = next[i]!;
                if (p.alt?.trim() || p.kind === "video" || p.kind === "audio") continue;
                if (!p.url.startsWith("http")) {
                  const off = suggestAltFromCaption(p.caption, title, p.url);
                  if (off) {
                    next[i] = { ...p, alt: off };
                  }
                  continue;
                }
                try {
                  const res = await aiImageAlt({ imageUrl: p.url, title });
                  if (res.ok && "alt" in res && res.alt?.trim()) {
                    next[i] = { ...p, alt: res.alt.trim().slice(0, 200) };
                    aiCount += 1;
                    continue;
                  }
                } catch {
                  /* per-photo fallback below */
                }
                const off = suggestAltFromCaption(p.caption, title, p.url);
                if (off) next[i] = { ...p, alt: off };
              }
              const credit = v.credit.trim() ? v.credit : suggestCredit("", v.authorName || v.byline);
              patch({ newPhotos: next, ...(credit !== v.credit.trim() ? { credit } : {}) });
              setLastDraft({
                fields: ['alt text'],
                engine: aiCount > 0 ? 'llm' : 'offline',
                snapshot: snapshotOf(['newPhotos', 'credit']),
              });
              const total = next.filter(
                (p, idx) => p.alt?.trim() && !v.newPhotos[idx]?.alt?.trim(),
              ).length;
              if (total === 0 && credit === v.credit.trim()) {
                addToast(copy.assistNothingToDo, "success");
              } else {
                addToast(
                  `${copy.assistDraftedCount.replace("{n}", String(total || 1))} (AI vision · ${aiCount} described)`,
                  "success",
                );
              }
            } finally {
              setAltWorking(false);
            }
          })();
          return;
        }
      }
      let changed = 0;
      const newPhotos = v.newPhotos.map((p) => {
        if (p.alt?.trim() || p.kind === "video" || p.kind === "audio") return p;
        const alt = suggestAltFromCaption(p.caption, title, p.url);
        if (!alt) return p;
        changed += 1;
        return { ...p, alt };
      });
      const credit = v.credit.trim() ? v.credit : suggestCredit("", v.authorName || v.byline);
      if (changed === 0 && credit === v.credit.trim()) {
        addToast(copy.assistNothingToDo, "success");
        return;
      }
      patch({ newPhotos, ...(credit !== v.credit.trim() ? { credit } : {}) });
      setLastDraft({ fields: ['alt text'], engine: 'offline', snapshot: snapshotOf(['newPhotos', 'credit']) });
      addToast(`${copy.assistDraftedCount.replace("{n}", String(changed || 1))} (offline)`, "success");
    },
  };

  /**
   * Derived fields re-derive while untouched. The two fields an editor actually
   * writes are the title and the body; everything else is a byproduct, so it
   * should follow them instead of waiting for a button press. `touched` is what
   * keeps this honest — the moment a field is edited by hand it stops being
   * rewritten, and a create-mode form never overwrites a stored row.
   */
  useEffect(() => {
    if (isEdit) return;
    const title = v.enTitle || v.frTitle;
    if (!title.trim()) return;
    const t = setTimeout(() => {
      const result = draftRemainingFields({
        type: v.type,
        enTitle: v.enTitle,
        frTitle: v.frTitle,
        enBody: v.enBody,
        frBody: v.frBody,
        enExcerpt: v.enExcerpt,
        frExcerpt: v.frExcerpt,
        enSeo: v.enSeo,
        frSeo: v.frSeo,
        slug: v.slug,
        tags: v.tags,
        shareText: v.shareText,
        categoryId: v.categoryId,
        locationId: v.locationId,
        authorName: v.authorName,
        categories: categoryOptions,
        locations,
        touched: touched as ReadonlySet<AutoFillField>,
      });
      if (result.applied.length > 0) patch(result.patch);
    }, 400);
    return () => clearTimeout(t);
    // Intentionally not re-running on every value it reads: `patch` above
    // changes `v`, which would loop. It keys on the two source fields plus the
    // taxonomy list, which is everything a suggestion can legitimately depend on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.enTitle, v.frTitle, v.enBody, v.frBody, v.type, categoryOptions, locations, touched, isEdit]);

  return {
    aiEnabled,
    aiModel,
    aiBudget,
    draftingAi,
    handleDraftAi,
    lastDraft,
    undoLastDraft,
    describeFields,
    suggestion,
    setSuggestion,
    applySuggestion,
    headlines,
    setHeadlines,
    headlinesWorking,
    handleHeadlines,
    verifyState,
    setVerifyState,
    verifyWorking,
    handleVerify,
    altWorking,
    repurpose,
    setRepurpose,
    repurposeWorking,
    handleRepurpose,
    assist,
  }
}
