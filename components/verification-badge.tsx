import { Badge } from "@/components/ui/badge";
import type { VerificationStatus } from "@/lib/auth/roles";

const LABELS: Record<VerificationStatus, string> = {
    verified: "✓ Verified",
    community_submission: "Community Submission",
    official_source: "Official Source",
    developing: "Developing",
};

const VARIANTS: Record<
    VerificationStatus,
    "default" | "secondary" | "outline" | "destructive"
> = {
    verified: "default",
    official_source: "default",
    community_submission: "secondary",
    developing: "outline",
};

export function VerificationBadge({ status }: { status: VerificationStatus }) {
    return <Badge variant={VARIANTS[status]}>{LABELS[status]}</Badge>;
}