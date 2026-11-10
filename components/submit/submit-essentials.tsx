"use client";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Dictionary } from "@/lib/i18n";
import { Field } from "./submit-field";
import { BUY_SELL_CATEGORIES, CURRENCIES, NOTICE_TYPES, type SubmitType } from "./submit-types";

type Fields = Dictionary["submit"]["fields"];
type Steps = Dictionary["submit"]["steps"];

/**
 * STEP 1 — essentials: the per-type field groups (photo / news+culture /
 * notice / buy-sell). One type renders; the switch that confused first-time
 * contributors lives on the `/submit` index, never inside this step.
 */
export function SubmitEssentials(props: {
    type: SubmitType;
    active: boolean;
    f: Fields;
    s: Steps;
    dict: Dictionary;
    selectedNoticeType: string;
    setSelectedNoticeType: (t: string) => void;
    initialDraft?: Record<string, string>;
    initialNoticeDirection?: "lost" | "found";
}) {
    const { type, active, f, s, dict, selectedNoticeType, setSelectedNoticeType, initialDraft, initialNoticeDirection } = props;
    const isPhoto = type === "photo-story";
    const isNews = type === "news";
    const isCulture = type === "culture";
    const isNotice = type === "notice";
    const isBuySell = type === "buy-sell";

    return (
        <div data-step-active={active} hidden={!active} className="space-y-5">
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
                    {selectedNoticeType === "lost_found" ? (
                        <Field label={f.noticeDirection} htmlFor="noticeDirection">
                            <select
                                id="noticeDirection"
                                name="noticeDirection"
                                required
                                defaultValue={
                                    initialDraft?.noticeDirection ||
                                    initialNoticeDirection ||
                                    ""
                                }
                                className="h-11 w-full rounded-md border border-input bg-transparent px-3 text-base shadow-xs focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30 md:text-sm"
                            >
                                <option value="" disabled>
                                    {f.noticeDirectionPlaceholder}
                                </option>
                                <option value="lost">{f.noticeDirectionLost}</option>
                                <option value="found">{f.noticeDirectionFound}</option>
                            </select>
                        </Field>
                    ) : null}
                    <Field label={f.noticeType} htmlFor="noticeType">
                        <select
                            id="noticeType"
                            name="noticeType"
                            required
                            value={selectedNoticeType}
                            onChange={(event) => setSelectedNoticeType(event.target.value)}
                            className="h-11 w-full rounded-md border border-input bg-transparent px-3 text-base shadow-xs focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30 md:text-sm"
                        >
                            <option value="" disabled>
                                {f.noticeTypePlaceholder}
                            </option>
                            {NOTICE_TYPES.map((t) => (
                                <option key={t} value={t}>
                                    {(dict.admin.content.noticeTypes as Record<string, string>)[t] ?? t}
                                </option>
                            ))}
                        </select>
                    </Field>
                    {selectedNoticeType === "lost_found" ? (
                        <>
                            <Field label={f.item} htmlFor="item">
                                <Input id="item" name="item" required placeholder={f.itemPlaceholder} />
                            </Field>
                        </>
                    ) : selectedNoticeType === "missing_person" ? (
                        <>
                            <Field label={f.personName} htmlFor="personName">
                                <Input
                                    id="personName"
                                    name="personName"
                                    required
                                    placeholder={f.personNamePlaceholder}
                                />
                            </Field>
                            <Field label={f.personDescription} htmlFor="personDescription">
                                <Textarea
                                    id="personDescription"
                                    name="personDescription"
                                    required
                                    placeholder={f.personDescriptionPlaceholder}
                                />
                            </Field>
                        </>
                    ) : null}
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
                                className="h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-base shadow-xs focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30 md:text-sm"
                            >
                                <option value="" disabled>
                                    {f.categoryPlaceholder}
                                </option>
                                {BUY_SELL_CATEGORIES.map((c) => (
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
                                className="h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-base shadow-xs focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30 md:text-sm"
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
    );
}
