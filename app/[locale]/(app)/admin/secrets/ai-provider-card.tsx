"use client";
/* eslint-disable react-hooks/set-state-in-effect -- initial vault state load mirrors the existing admin dialogs */

import { useEffect, useState } from "react";
import {
  getAiProviderState,
  saveAiProviderKey,
  saveAiProviderSettings,
  saveDeeplKey,
  type AiProviderState,
} from "@/lib/admin/actions/ai-settings";
import { AI_PROVIDER_PRESETS } from "@/lib/ai/providers";
import { useToast } from "@/components/admin/toast";
import { ui, Field } from "@/lib/admin/ui-constants";

type Copy = {
  aiTitle: string;
  aiDescription: string;
  aiKeySourceVault: string;
  aiKeySourceEnv: string;
  aiKeySourceNone: string;
  aiProviderLabel: string;
  aiBaseUrlLabel: string;
  aiModelLabel: string;
  aiVisionLabel: string;
  aiEmbedLabel: string;
  aiBudgetLabel: string;
  aiDisabledLabel: string;
  aiKeyLabel: string;
  aiKeyPlaceholder: string;
  aiSaveKey: string;
  aiSavingKey: string;
  aiSaveSettings: string;
  aiSavingSettings: string;
  aiSaved: string;
  aiSettingsSaved: string;
  aiDeeplLabel: string;
  aiSaveDeepl: string;
  aiVaultMeta: string;
  aiStorageMissing: string;
};

/**
 * AI provider setup (chief-only page): validate-then-store the LLM key in
 * the encrypted vault plus plain-text tuning (base URL, models, budget,
 * kill-switch) in app_flags. The key value never renders back — after save
 * the card shows source + version only.
 */
export function AiProviderCard({ copy }: { copy: Copy }) {
  const { addToast } = useToast();
  const [state, setState] = useState<AiProviderState | null>(null);
  const [loading, setLoading] = useState(true);

  const [presetId, setPresetId] = useState("openai");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [savingKey, setSavingKey] = useState(false);

  const [visionModel, setVisionModel] = useState("");
  const [embedModel, setEmbedModel] = useState("");
  const [budget, setBudget] = useState("200000");
  const [disabled, setDisabled] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  const [deeplKey, setDeeplKey] = useState("");
  const [savingDeepl, setSavingDeepl] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const res = await getAiProviderState();
      if (res && !("ok" in res)) {
        setState(res);
        setBaseUrl(res.baseUrl);
        setModel(res.model);
        setVisionModel(res.visionModel === res.model ? "" : res.visionModel);
        setEmbedModel(res.embedModel);
        setBudget(String(res.budgetTokensDay));
        setDisabled(res.disabled);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  const preset = AI_PROVIDER_PRESETS.find((p) => p.id === presetId) ?? AI_PROVIDER_PRESETS[0]!;
  const effectiveBase = baseUrl.trim() || preset.baseUrl;
  const effectiveModel = model.trim() || preset.model;

  async function onSaveKey(e: React.FormEvent) {
    e.preventDefault();
    if (savingKey) return;
    setSavingKey(true);
    try {
      const res = await saveAiProviderKey({
        presetId,
        baseUrl: baseUrl.trim() || undefined,
        model: model.trim() || undefined,
        apiKey,
      });
      if (!res.ok) {
        addToast(res.error, "error");
        return;
      }
      setApiKey("");
      addToast(copy.aiSaved, "success");
      await refresh();
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Save failed.", "error");
    } finally {
      setSavingKey(false);
    }
  }

  async function onSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    if (savingSettings) return;
    setSavingSettings(true);
    try {
      const res = await saveAiProviderSettings({
        baseUrl: effectiveBase,
        model: effectiveModel,
        visionModel: visionModel.trim(),
        embedModel: embedModel.trim() || "text-embedding-3-small",
        budgetTokensDay: Number(budget),
        disabled,
      });
      if (!res.ok) {
        addToast(res.error, "error");
        return;
      }
      addToast(copy.aiSettingsSaved, "success");
      await refresh();
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Save failed.", "error");
    } finally {
      setSavingSettings(false);
    }
  }

  async function onSaveDeepl(e: React.FormEvent) {
    e.preventDefault();
    if (savingDeepl) return;
    setSavingDeepl(true);
    try {
      const res = await saveDeeplKey(deeplKey);
      if (!res.ok) {
        addToast(res.error, "error");
        return;
      }
      setDeeplKey("");
      addToast(copy.aiSaved, "success");
      await refresh();
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Save failed.", "error");
    } finally {
      setSavingDeepl(false);
    }
  }

  const sourceLabel =
    state?.keySource === "vault"
      ? copy.aiKeySourceVault
      : state?.keySource === "env"
        ? copy.aiKeySourceEnv
        : copy.aiKeySourceNone;

  return (
    <section aria-label={copy.aiTitle} className="rounded-lg border border-primary/30 bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{copy.aiTitle}</h2>
        <span
          role="status"
          className={`rounded-full border px-2 py-0.5 text-xs font-medium ${state?.keySource === "vault" || state?.keySource === "env" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "border-border bg-muted text-muted-foreground"}`}
        >
          {loading ? "…" : sourceLabel}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{copy.aiDescription}</p>
      {state && !state.storageReady ? (
        <p className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-800 dark:text-amber-300">
          {copy.aiStorageMissing}
        </p>
      ) : null}
      {state?.vault ? (
        <p className="mt-2 text-xs text-muted-foreground">
          {copy.aiVaultMeta
            .replace("{version}", String(state.vault.version))
            .replace("{provider}", state.vault.provider)
            .replace("{time}", state.vault.updatedAt.slice(0, 10))}
        </p>
      ) : null}

      <form onSubmit={onSaveKey} className="mt-3 grid gap-3 border-t border-border pt-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={copy.aiProviderLabel}>
            <select value={presetId} onChange={(e) => setPresetId(e.target.value)} className={ui.input}>
              {AI_PROVIDER_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label={copy.aiKeyLabel}>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={copy.aiKeyPlaceholder}
              autoComplete="off"
              className={ui.input}
            />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={copy.aiBaseUrlLabel}>
            <input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={preset.baseUrl}
              inputMode="url"
              className={ui.input}
            />
          </Field>
          <Field label={copy.aiModelLabel}>
            <input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={preset.model}
              className={ui.input}
            />
          </Field>
        </div>
        <div>
          <button type="submit" disabled={savingKey || !apiKey.trim()} className={ui.btnPrimary}>
            {savingKey ? copy.aiSavingKey : copy.aiSaveKey}
          </button>
        </div>
      </form>

      <form onSubmit={onSaveSettings} className="mt-3 grid gap-3 border-t border-border pt-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={copy.aiVisionLabel}>
            <input
              value={visionModel}
              onChange={(e) => setVisionModel(e.target.value)}
              placeholder={effectiveModel}
              className={ui.input}
            />
          </Field>
          <Field label={copy.aiEmbedLabel}>
            <input
              value={embedModel}
              onChange={(e) => setEmbedModel(e.target.value)}
              placeholder="text-embedding-3-small"
              className={ui.input}
            />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={copy.aiBudgetLabel}>
            <input
              type="number"
              min={1000}
              step={1000}
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              className={ui.input}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={disabled} onChange={(e) => setDisabled(e.target.checked)} />
            {copy.aiDisabledLabel}
          </label>
        </div>
        <div>
          <button type="submit" disabled={savingSettings} className={ui.btnSecondary}>
            {savingSettings ? copy.aiSavingSettings : copy.aiSaveSettings}
          </button>
        </div>
      </form>

      <form onSubmit={onSaveDeepl} className="mt-3 grid gap-3 border-t border-border pt-3">
        <Field label={copy.aiDeeplLabel}>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="password"
              value={deeplKey}
              onChange={(e) => setDeeplKey(e.target.value)}
              placeholder={copy.aiKeyPlaceholder}
              autoComplete="off"
              className={ui.input}
            />
            <button type="submit" disabled={savingDeepl || !deeplKey.trim()} className={ui.btnSecondary}>
              {savingDeepl ? copy.aiSavingKey : copy.aiSaveDeepl}
            </button>
          </div>
        </Field>
      </form>
    </section>
  );
}
