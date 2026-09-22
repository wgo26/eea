"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Info, Loader2, LocateFixed, MapPin } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { submitStory, saveStoryDraft } from "@/lib/public/actions";
import { MediaField } from "@/components/submit/media-field";
import { useSubmitDraft } from "@/components/submit/use-submit-draft";
import { TurnstileWidget } from "@/components/security/turnstile-widget";
import type { SubmitState } from "@/lib/public/types";
import { localePath } from "@/lib/i18n/urls";
import { useLocaleFromPath } from "@/components/site-header";
import { noticeTypeLabel, NOTICE_TYPE_META } from "@/lib/notice-types";
import { createClient } from "@/lib/supabase/client";
import type { Dictionary } from "@/lib/i18n";

export type SubmitType =
    | "photo-story"
    | "news"
    | "culture"
    | "notice"
    | "buy-sell";

export type SubmitInitial = {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    locationId?: string | null;
    locationText?: string | null;
};

export const TYPE_TO_DB: Record<SubmitType, string> = {
    "photo-story": "photo_story",
    news: "news",
    culture: "culture",
    notice: "notice",
    "buy-sell": "buy_sell",
};

const CURRENCIES = ["XAF", "XOF", "CDF", "USD", "EUR", "NGN", "GHS"];

const NOTICE_TYPES = Object.keys(NOTICE_TYPE_META);

function Field({
    label,
    htmlFor,
    children,
    hint,
    help,
}: {
    label: string;
    htmlFor: string;
    children: React.ReactNode;
    hint?: string;
    help?: string;
}) {
    return (
        <div className="space-y-1.5">
            <span className="flex items-center gap-1.5">
                <Label htmlFor={htmlFor}>{label}</Label>
                {help ? (
                    <Popover>
                        <PopoverTrigger
                            type="button"
                            aria-label={`${label} help`}
                            className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
                        >
                            <Info className="h-3.5 w-3.5" aria-hidden />
                        </PopoverTrigger>
                        <PopoverContent className="w-64 text-xs leading-relaxed">
                            {help}
                        </PopoverContent>
                    </Popover>
                ) : null}
            </span>
            {children}
            {hint ? (
                <p className="text-xs text-muted-foreground">{hint}</p>
            ) : null}
        </div>
    );
}

type LocationSuggestion = { id: string; name: string; slug: string };

/**
 * Location step field: autocomplete against canonical `locations`, one-tap
 * browser geolocation, and free-text fallback. Selecting a suggestion stores
 * its id (hidden `location_id`); free text is kept as `location_text` for
 * editors to resolve — public input never creates location rows.
 */
function LocationField({
    label,
    placeholder,
    detectLabel,
    detectedLabel,
    keepAsSuggestionLabel,
    initialText,
    initialId,
}: {
    label: string;
    placeholder?: string;
    detectLabel: string;
    detectedLabel: string;
    keepAsSuggestionLabel: string;
    initialText?: string | null;
    initialId?: string | null;
}) {
    const [text, setText] = React.useState(initialText ?? "");
    const [locationId, setLocationId] = React.useState(initialId ?? "");
    const [items, setItems] = React.useState<LocationSuggestion[]>([]);
    const [open, setOpen] = React.useState(false);
    const [detecting, setDetecting] = React.useState(false);
    const [coords, setCoords] = React.useState<{ lat: number; lng: number } | null>(null);
    const boxRef = React.useRef<HTMLDivElement>(null);

    const updateText = (value: string) => {
        setText(value);
        setLocationId("");
        if (value.trim().length < 2) {
            setItems([]);
            setOpen(false);
        }
    };

    React.useEffect(() => {
        if (text.trim().length < 2) return;
        let cancelled = false;
        const t = window.setTimeout(async () => {
            try {
                const supabase = createClient();
                const { data } = await supabase
                    .from("locations")
                    .select("id, name, slug")
                    .eq("is_active", true)
                    .ilike("name", `%${text.trim().slice(0, 60)}%`)
                    .order("name")
                    .limit(6);
                if (!cancelled) {
                    setItems((data ?? []) as LocationSuggestion[]);
                    setOpen(true);
                }
            } catch {
                if (!cancelled) setOpen(false);
            }
        }, 250);
        return () => {
            cancelled = true;
            window.clearTimeout(t);
        };
    }, [text]);

    React.useEffect(() => {
        const onDoc = (e: MouseEvent) => {
            if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", onDoc);
        return () => document.removeEventListener("mousedown", onDoc);
    }, []);

    const detect = () => {
        if (!("geolocation" in navigator)) return;
        setDetecting(true);
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                setDetecting(false);
                const lat = Math.round(pos.coords.latitude * 10000) / 10000;
                const lng = Math.round(pos.coords.longitude * 10000) / 10000;
                setCoords({ lat, lng });
                if (!text.trim()) setText(`${lat}, ${lng}`);
            },
            () => setDetecting(false),
            { timeout: 8000 },
        );
    };

    return (
        <div ref={boxRef} className="space-y-1.5">
            <span className="flex items-center justify-between gap-2">
                <Label htmlFor="location">{label}</Label>
                <button
                    type="button"
                    onClick={detect}
                    disabled={detecting}
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline disabled:opacity-50"
                >
                    <LocateFixed className="h-3.5 w-3.5" aria-hidden />
                    {detecting ? "…" : detectLabel}
                </button>
            </span>
            <div className="relative">
                <MapPin className="pointer-events-none absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
                <Input
                    id="location"
                    name="location"
                    value={text}
                    onChange={(e) => updateText(e.target.value)}
                    onFocus={() => {
                        if (items.length) setOpen(true);
                    }}
                    placeholder={placeholder}
                    autoComplete="off"
                    className="pl-8"
                />
                {open && (items.length > 0 || text.trim()) ? (
                    <div className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-md border bg-popover shadow-md">
                        <ul role="listbox" aria-label={label} className="max-h-56 overflow-auto p-1">
                            {items.map((s) => (
                                <li key={s.id}>
                                    <button
                                        type="button"
                                        role="option"
                                        aria-selected={locationId === s.id}
                                        onClick={() => {
                                            setText(s.name);
                                            setLocationId(s.id);
                                            setOpen(false);
                                        }}
                                        className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
                                    >
                                        <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                                        <span className="truncate">{s.name}</span>
                                    </button>
                                </li>
                            ))}
                            {text.trim() ? (
                                <li>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setLocationId("");
                                            setOpen(false);
                                        }}
                                        className="w-full truncate px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-accent"
                                    >
                                        {keepAsSuggestionLabel}: “{text.trim().slice(0, 60)}”
                                    </button>
                                </li>
                            ) : null}
                        </ul>
                    </div>
                ) : null}
            </div>
            {coords ? (
                <p className="text-xs text-muted-foreground">
                    {detectedLabel}: {coords.lat}, {coords.lng}
                </p>
            ) : null}
            {/* Canonical pick (nullable) + raw text + coords for the intake action. */}
            <input type="hidden" name="location_id" value={locationId} />
            <input type="hidden" name="location_text" value={text} />
            <input type="hidden" name="latitude" value={coords ? String(coords.lat) : ""} />
            <input type="hidden" name="longitude" value={coords ? String(coords.lng) : ""} />
        </div>
    );
}

export function SubmitForm({
    type,
    dict,
    canUpload = false,
    initial,
    initialDraft,
}: {
    type: SubmitType;
    dict: Dictionary;
    canUpload?: boolean;
    initial?: SubmitInitial;
    initialDraft?: Record<string, string>;
}) {
    const router = useRouter();
    const locale = useLocaleFromPath();
    const [state, formAction, pending] = useActionState<SubmitState, FormData>(
        submitStory,
        { ok: false },
    );
    const [draftState, draftAction, draftPending] = useActionState<SubmitState, FormData>(
        saveStoryDraft,
        { ok: false },
    );
    const f = dict.submit.fields;
    const s = dict.submit.steps;
    const [step, setStep] = React.useState(0);
    // Signed-in contributors with a known name start with contact collapsed.
    const [showContact, setShowContact] = React.useState(!initial?.name);
    const [mediaOpen, setMediaOpen] = React.useState(false);
    const formRef = React.useRef<HTMLFormElement>(null);
    const stepRef = React.useRef<HTMLDivElement>(null);

    // Phase 3 — draft autosave: restore unsent fields after a dropped
    // connection, clear on success.
    const { restored, clearDraft } = useSubmitDraft(type, formRef);
    React.useEffect(() => {
        if (initialDraft && formRef.current) {
            // Apply the server draft values to the form inputs if present
            for (const [key, val] of Object.entries(initialDraft)) {
                const el = formRef.current.elements.namedItem(key);
                if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
                    if (el instanceof HTMLInputElement && el.type === "checkbox") {
                        el.checked = Boolean(val);
                    } else if (val && typeof val === "string") {
                        el.value = val;
                    }
                }
            }
        }
    }, [initialDraft]);
    
    React.useEffect(() => {
        if (state.ok) {
            clearDraft();
            router.push(localePath(locale, "/submit/confirmation"));
        }
    }, [state.ok, router, locale, clearDraft]);

    React.useEffect(() => {
        if (draftState.ok) {
            // Optional: show a toast or message
            clearDraft(); // clear local draft since server took over
        }
    }, [draftState.ok, clearDraft]);

    const goStep = (next: number) => {
        if (next > step) {
            // Validate only the visible step before advancing.
            const root = stepRef.current;
            if (root) {
                const required = Array.from(
                    root.querySelectorAll<HTMLElement>("[data-step-active='true'] [required]"),
                );
                for (const el of required) {
                    const input = el as HTMLInputElement;
                    if (!input.checkValidity()) {
                        input.reportValidity();
                        return;
                    }
                }
            }
        }
        setStep(next);
        stepRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    };

    if (state.ok) {
        return (
            <div className="rounded-2xl border bg-card p-8 text-center">
                <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" aria-hidden />
                <p className="mt-3 font-bold">{dict.submit.successTitle}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                    {dict.submit.successBody}
                </p>
                <Button render={<Link href={localePath(locale, "/submit/confirmation")} />} className="mt-4">
                    {dict.submit.successTitle}
                </Button>
            </div>
        );
    }

    const isPhoto = type === "photo-story";
    const isNews = type === "news";
    const isCulture = type === "culture";
    const isNotice = type === "notice";
    const isBuySell = type === "buy-sell";

    const uploadCopy = {
        retryFailed: dict.submit.retryUpload,
        failedCount: dict.submit.uploadFailedCount,
    };
    return (
        <form ref={formRef} action={formAction} className="space-y-5">
            <input type="hidden" name="submissionType" value={TYPE_TO_DB[type]} />

            {/* Phase 3 — restored-draft notice (autosave survived a dropped connection). */}
            {restored ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
                    <p className="font-medium">{dict.submit.draftRestored}</p>
                    <button
                        type="button"
                        onClick={clearDraft}
                        className="font-medium text-primary hover:underline"
                    >
                        {dict.submit.draftDiscard}
                    </button>
                </div>
            ) : null}

            {/* Stepper */}
            <ol className="flex items-center gap-2 text-xs font-medium" aria-label={s.label}>
                {[s.one, s.two, s.three].map((label, i) => (
                    <li key={label} className="flex flex-1 items-center gap-2">
                        <span
                            aria-current={step === i ? "step" : undefined}
                            className={
                                step === i
                                    ? "flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
                                    : step > i
                                      ? "flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white"
                                      : "flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
                            }
                        >
                            {i + 1}
                        </span>
                        <span className={step === i ? "text-foreground" : "text-muted-foreground"}>{label}</span>
                        {i < 2 ? <span className="h-px flex-1 bg-border" aria-hidden /> : null}
                    </li>
                ))}
            </ol>

            {/* Contact card — collapsed for signed-in contributors */}
            <div className="rounded-2xl border bg-muted/30 p-4">
                {initial?.name && !showContact ? (
                    <div className="flex items-center justify-between gap-3 text-sm">
                        <p>
                            {s.submittingAs}{" "}
                            <strong>{initial.name}</strong>
                            {initial.email ? ` · ${initial.email}` : ""}
                        </p>
                        <button
                            type="button"
                            onClick={() => setShowContact(true)}
                            className="shrink-0 font-medium text-primary hover:underline"
                        >
                            {s.change}
                        </button>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-bold">{s.contact}</p>
                            {initial?.name ? (
                                <button
                                    type="button"
                                    onClick={() => setShowContact(false)}
                                    className="text-xs font-medium text-primary hover:underline"
                                >
                                    {s.useProfile}
                                </button>
                            ) : null}
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <Field label={f.contributorName} htmlFor="contributorName">
                                <Input
                                    id="contributorName"
                                    name="contributorName"
                                    defaultValue={initial?.name ?? ""}
                                    required={!initial?.name}
                                    placeholder={f.contributorNamePlaceholder}
                                />
                            </Field>
                            <Field label={f.email} htmlFor="email">
                                <Input
                                    id="email"
                                    name="email"
                                    type="email"
                                    defaultValue={initial?.email ?? ""}
                                    placeholder={f.emailPlaceholder}
                                />
                            </Field>
                        </div>
                        <Field label={f.phone} htmlFor="phone">
                            <Input
                                id="phone"
                                name="phone"
                                defaultValue={initial?.phone ?? ""}
                                placeholder={f.phonePlaceholder}
                            />
                        </Field>
                    </div>
                )}
                {initial?.name && !showContact ? (
                    <>
                        <input type="hidden" name="contributorName" value={initial.name} />
                        <input type="hidden" name="email" value={initial.email ?? ""} />
                        <input type="hidden" name="phone" value={initial.phone ?? ""} />
                    </>
                ) : null}
            </div>

            <div ref={stepRef}>
                {/* STEP 1 — essentials */}
                <div data-step-active={step === 0} hidden={step !== 0} className="space-y-5">
                    {isPhoto ? (
                        <>
                            <Field label={f.what} htmlFor="what" help={s.whatHelp}>
                                <Textarea
                                    id="what"
                                    name="what"
                                    required
                                    placeholder={f.whatPlaceholder}
                                />
                            </Field>
                            <Field label={f.description} htmlFor="description">
                                <Textarea id="description" name="description" placeholder={f.descriptionPlaceholder} />
                            </Field>
                        </>
                    ) : null}

                    {isNews || isCulture ? (
                        <>
                            <Field label={f.headline} htmlFor="headline">
                                <Input id="headline" name="headline" required placeholder={f.headlinePlaceholder} />
                            </Field>
                            <Field label={f.description} htmlFor="description">
                                <Textarea
                                    id="description"
                                    name="description"
                                    required
                                    placeholder={f.descriptionPlaceholder}
                                />
                            </Field>
                        </>
                    ) : null}

                    {isNotice ? (
                        <>
                            <Field label={f.noticeType} htmlFor="noticeType">
                                <select
                                    id="noticeType"
                                    name="noticeType"
                                    required
                                    defaultValue=""
                                    className="h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm shadow-xs focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                                >
                                    <option value="" disabled>
                                        {f.noticeTypePlaceholder}
                                    </option>
                                    {NOTICE_TYPES.map((t) => (
                                        <option key={t} value={t}>
                                            {noticeTypeLabel(t)}
                                        </option>
                                    ))}
                                </select>
                            </Field>
                            <Field label={f.item} htmlFor="item">
                                <Input id="item" name="item" required placeholder={f.itemPlaceholder} />
                            </Field>
                            <Field label={f.message} htmlFor="message" help={s.messageHelp}>
                                <Textarea id="message" name="message" required placeholder={f.messagePlaceholder} />
                            </Field>
                        </>
                    ) : null}

                    {isBuySell ? (
                        <>
                            <Field label={f.item} htmlFor="item">
                                <Input id="item" name="item" required placeholder={f.itemPlaceholder} />
                            </Field>
                            <div className="grid gap-4 sm:grid-cols-3">
                                <Field label={f.category} htmlFor="category">
                                    <select
                                        id="category"
                                        name="category"
                                        required
                                        defaultValue=""
                                        className="h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm shadow-xs focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                                    >
                                        <option value="" disabled>
                                            {f.categoryPlaceholder}
                                        </option>
                                        {["phones", "vehicles", "property", "furniture", "fashion", "jobs", "agriculture", "household", "business", "other"].map((c) => (
                                            <option key={c} value={c}>
                                                {(dict.buySell as Record<string, string>)[`category${c.charAt(0).toUpperCase()}${c.slice(1)}`] ?? c}
                                            </option>
                                        ))}
                                    </select>
                                </Field>
                                <Field label={f.price} htmlFor="price">
                                    <Input id="price" name="price" type="number" min="0" step="any" placeholder={f.pricePlaceholder} />
                                </Field>
                                <Field label={f.currency} htmlFor="currency">
                                    <select
                                        id="currency"
                                        name="currency"
                                        defaultValue="XAF"
                                        className="h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm shadow-xs focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                                    >
                                        {CURRENCIES.map((c) => (
                                            <option key={c} value={c}>
                                                {c}
                                            </option>
                                        ))}
                                    </select>
                                </Field>
                            </div>
                            <Field label={f.description} htmlFor="description">
                                <Textarea
                                    id="description"
                                    name="description"
                                    required
                                    placeholder={f.descriptionPlaceholder}
                                />
                            </Field>
                        </>
                    ) : null}
                </div>

                {/* STEP 2 — details (location + dates) */}
                <div data-step-active={step === 1} hidden={step !== 1} className="space-y-5">
                    <LocationField
                        label={f.location}
                        placeholder={f.locationPlaceholder}
                        detectLabel={s.detect}
                        detectedLabel={s.detected}
                        keepAsSuggestionLabel={s.keepSuggestion}
                        initialText={initial?.locationText}
                        initialId={initial?.locationId}
                    />
                    {isPhoto || isNews ? (
                        <div className="grid gap-4 sm:grid-cols-2">
                            <Field label={f.date} htmlFor="date">
                                <Input id="date" name="date" type="date" />
                            </Field>
                            <p className="self-end text-xs text-muted-foreground">{s.detailsHint}</p>
                        </div>
                    ) : null}
                    {isNotice ? (
                        <>
                            <div className="grid gap-4 sm:grid-cols-2">
                                <Field label={f.expiry} htmlFor="expiry" help={s.expiryHelp}>
                                    <Input id="expiry" name="expiry" type="date" />
                                </Field>
                                <Field label={f.organization} htmlFor="organization">
                                    <Input id="organization" name="organization" placeholder={f.organizationPlaceholder} />
                                </Field>
                            </div>
                            <Field label={f.doc} htmlFor="doc">
                                <Input id="doc" name="doc" placeholder={f.docPlaceholder} />
                            </Field>
                        </>
                    ) : null}
                    {isPhoto || isNews || isCulture || isBuySell ? (
                        <p className="text-xs text-muted-foreground">{s.detailsHint}</p>
                    ) : null}
                </div>

                {/* STEP 3 — media + consent + review */}
                <div data-step-active={step === 2} hidden={step !== 2} className="space-y-5">
                    <div className="rounded-2xl border">
                        <button
                            type="button"
                            onClick={() => setMediaOpen((v) => !v)}
                            aria-expanded={mediaOpen}
                            className="flex w-full items-center justify-between gap-2 p-4 text-left text-sm font-bold"
                        >
                            {s.media} <span className="text-xs font-medium text-muted-foreground">{s.optional}</span>
                        </button>
                        <div hidden={!mediaOpen} className="space-y-5 border-t p-4">
                            {!canUpload ? (
                                <p className="rounded-xl border border-border bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground">
                                    {dict.submit.signInToUpload}{" "}
                                    <Link href={localePath(locale, "/account/login")} className="font-medium text-primary underline">
                                        {dict.auth.login.submit}
                                    </Link>
                                </p>
                            ) : null}
                            <Field label={f.photos} htmlFor="photos" hint={f.photosHint}>
                                <MediaField kind="image" name="photos" placeholder={f.photosPlaceholder} canUpload={canUpload} uploadCopy={uploadCopy} />
                            </Field>
                            <Field label={f.videos} htmlFor="videos" hint={f.videosHint}>
                                <MediaField kind="video" name="videos" placeholder={f.videosPlaceholder} canUpload={canUpload} uploadCopy={uploadCopy} />
                            </Field>
                            <Field label={f.audios} htmlFor="audios" hint={f.audiosHint}>
                                <MediaField kind="audio" name="audios" placeholder={f.audiosPlaceholder} canUpload={canUpload} uploadCopy={uploadCopy} />
                            </Field>
                            <Field label={f.documents} htmlFor="documents" hint={f.documentsHint}>
                                <MediaField kind="document" name="documents" placeholder={f.documentsPlaceholder} canUpload={canUpload} uploadCopy={uploadCopy} />
                            </Field>
                        </div>
                    </div>

                    <div className="space-y-2 rounded-2xl border bg-muted/30 p-4 text-sm">
                        <label className="flex items-start gap-2">
                            <input type="checkbox" name="rights" required className="mt-1" />
                            <span>{dict.submit.consent}</span>
                        </label>
                        <label className="flex items-start gap-2">
                            <input type="checkbox" name="consent" required className="mt-1" />
                            <span>
                                {dict.submit.consentLink}{" "}
                                <Link href={localePath(locale, "/about/guidelines")} className="underline">
                                    {dict.footer.guidelines}
                                </Link>{" "}
                                &{" "}
                                <Link href={localePath(locale, "/about/terms")} className="underline">
                                    {dict.footer.terms}
                                </Link>
                                .
                            </span>
                        </label>
                    </div>

                    {state.error ? (
                        <p className="text-sm text-destructive">
                            {state.error === "rate_limited"
                                ? dict.submit.errorRateLimited
                                : state.error === "captcha"
                                  ? dict.submit.errorCaptcha
                                  : dict.submit.errorGeneric}
                        </p>
                    ) : null}

                    <input
                        type="text"
                        name="website"
                        tabIndex={-1}
                        autoComplete="off"
                        aria-hidden="true"
                        className="hidden"
                    />
                    <TurnstileWidget />

                    <div className="flex flex-col gap-3 sm:flex-row">
                        {canUpload ? (
                            <Button 
                                type="submit" 
                                formAction={draftAction} 
                                disabled={pending || draftPending} 
                                variant="outline" 
                                className="w-full sm:w-1/3"
                            >
                                {draftPending ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                                        {dict.submit.submitting}
                                    </>
                                ) : (
                                    "Save Draft"
                                )}
                            </Button>
                        ) : null}
                        <Button type="submit" disabled={pending || draftPending} className="w-full flex-1">
                            {pending ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                                    {dict.submit.submitting}
                                </>
                            ) : (
                                dict.submit.submit
                            )}
                        </Button>
                    </div>
                </div>
            </div>

            {/* Step nav */}
            <div className="flex items-center justify-between gap-3">
                <Button
                    type="button"
                    variant="outline"
                    disabled={step === 0 || pending}
                    onClick={() => goStep(step - 1)}
                >
                    {s.back}
                </Button>
                {step < 2 ? (
                    <Button type="button" onClick={() => goStep(step + 1)}>
                        {s.continue}
                    </Button>
                ) : (
                    <Button type="button" variant="ghost" onClick={() => goStep(0)}>
                        {s.review}
                    </Button>
                )}
            </div>
        </form>
    );
}
