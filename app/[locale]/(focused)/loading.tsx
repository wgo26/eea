import { FocusedPageSkeleton } from "@/components/system/page-skeletons";

/**
 * Loading state for focused screens (auth, submit forms) — a minimal
 * centered card with the aperture mark, no chrome.
 */
export default function Loading() {
    return <FocusedPageSkeleton />;
}