import { PublicPageSkeleton } from "@/components/system/page-skeletons";

/**
 * Loading state for every (public) page (checklist: no blank navigation).
 * The skeleton mirrors the editorial rhythm — title, lead block, card grid.
 */
export default function Loading() {
    return <PublicPageSkeleton />;
}