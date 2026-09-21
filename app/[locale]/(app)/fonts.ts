import localFont from "next/font/local";

/**
 * Phase 1 font budget — admin/account-only monospace.
 *
 * `font-mono` is used exclusively in (app) surfaces (admin tables, account
 * secrets, policy diffs). Loading GeistMono in the ROOT layout forced every
 * anonymous public reader to download 58 KB of unused font bytes. This
 * module loads it once for the whole (app) subtree instead; the root layout
 * ships Inter only.
 */
export const appMono = localFont({
    src: "../../fonts/GeistMono-Variable.woff2",
    variable: "--font-geist-mono",
    weight: "100 900",
    display: "swap",
});
