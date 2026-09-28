"use client";

import dynamic from "next/dynamic";

/**
 * Client-component host for the install prompt. `ssr: false` is not allowed
 * in a Server Component (the public layout), so the dynamic import lives
 * here: the prompt renders only in the browser, where localStorage and
 * matchMedia — which decide its eligibility — actually exist.
 */
const InstallPrompt = dynamic(
    () => import("@/components/system/install-prompt").then((m) => m.InstallPrompt),
    { ssr: false },
);

export function InstallPromptHost({
    siteName,
    copy,
}: {
    siteName: string;
    copy: React.ComponentProps<typeof InstallPrompt>["copy"];
}) {
    return <InstallPrompt siteName={siteName} copy={copy} />;
}
