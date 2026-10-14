"use client";

import { Input } from "@/components/ui/input";
import type { Dictionary } from "@/lib/i18n";
import { Field } from "./submit-field";
import { LocationField } from "./location-field";
import type { SubmitInitial, SubmitType } from "./submit-types";

type Fields = Dictionary["submit"]["fields"];
type Steps = Dictionary["submit"]["steps"];

/**
 * STEP 2 — details: canonical location pick (+ free-text suggestion) and
 * per-type date/notice extras. Photo/news get the event date; notices get
 * expiry/org/doc; everything else gets the location hint line.
 */
export function SubmitDetailsStep(props: {
    type: SubmitType;
    active: boolean;
    f: Fields;
    s: Steps;
    initial?: SubmitInitial;
}) {
    const { type, active, f, s, initial } = props;
    const isPhoto = type === "photo-story";
    const isNews = type === "news";
    const isCulture = type === "culture";
    const isNotice = type === "notice";
    const isBuySell = type === "buy-sell";

    return (
        <div data-step-active={active} hidden={!active} className="space-y-5">
            <LocationField
                label={f.location}
                placeholder={f.locationPlaceholder}
                detectLabel={s.detect}
                detectedLabel={s.detected}
                resolvingLabel={s.resolving}
                resolveFailedLabel={s.resolveFailed}
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
    );
}
