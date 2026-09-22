/**
 * Phase 3 — print header for detail pages. Screen-hidden (`print-only`
 * utility in globals.css), print-visible: title, date line and canonical URL
 * so a wall-posted notice or printed article stays attributable offline.
 */
export function PrintHeader({
    title,
    dateLine,
    url,
    extra,
}: {
    title: string;
    dateLine?: string | null;
    url: string;
    extra?: string | null;
}) {
    return (
        <div className="print-only" aria-hidden>
            <p style={{ fontWeight: 800, fontSize: "18pt", margin: 0 }}>{title}</p>
            {dateLine ? (
                <p style={{ fontSize: "10pt", margin: "4px 0 0" }}>{dateLine}</p>
            ) : null}
            {extra ? (
                <p style={{ fontSize: "10pt", margin: "4px 0 0" }}>{extra}</p>
            ) : null}
            <p style={{ fontSize: "9pt", margin: "4px 0 12px", wordBreak: "break-all" }}>{url}</p>
        </div>
    );
}
