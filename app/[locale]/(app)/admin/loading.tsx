import { AdminPageSkeleton } from "@/components/system/page-skeletons";

/**
 * Loading state for the admin workspace — command-center rhythm (header,
 * stat grid, table) so staff see the shape of the page while it streams.
 */
export default function Loading() {
    return <AdminPageSkeleton />;
}