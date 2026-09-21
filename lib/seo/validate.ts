/**
 * Local Rich-Results validation gate (replaces the external manual step).
 *
 * Google's Rich Results Test is a hosted tool, so CI enforces the same
 * contract structurally: every schema our builders emit must carry the
 * properties Google requires for eligibility, and the recommended ones are
 * reported as warnings. lib/seo/jsonld.test.ts runs fixtures for every
 * public detail type through this validator — a page that drops a required
 * field fails `npm test` instead of failing silently in Search Console.
 *
 * Required vs recommended follows Google's Search Gallery documentation:
 * Article (headline), Event (name, startDate), Product (name + Offer with
 * price/currency), BreadcrumbList (non-empty itemListElement).
 */

export type JsonLdIssue = {
    severity: "error" | "warning";
    /** JSON path of the offending node, e.g. ` Offer.price`. */
    path: string;
    message: string;
};

type Node = Record<string, unknown>;

function isObj(value: unknown): value is Node {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | null {
    return typeof value === "string" && value.trim() ? value : null;
}

/** Unwraps { @context, @graph } or a bare node/array into nodes. */
function nodesOf(graph: unknown): Node[] {
    if (Array.isArray(graph)) return graph.filter(isObj);
    if (isObj(graph) && Array.isArray(graph["@graph"])) {
        return (graph["@graph"] as unknown[]).filter(isObj);
    }
    if (isObj(graph)) return [graph];
    return [];
}

function checkArticle(node: Node, path: string, out: JsonLdIssue[]): void {
    if (!str(node.headline)) {
        out.push({ severity: "error", path: `${path}.headline`, message: "Article requires headline." });
    }
    if (!node.image) {
        out.push({ severity: "warning", path: `${path}.image`, message: "Article should carry image for rich eligibility." });
    }
    if (!str(node.datePublished)) {
        out.push({ severity: "warning", path: `${path}.datePublished`, message: "Article should carry datePublished." });
    }
    if (!isObj(node.author)) {
        out.push({ severity: "warning", path: `${path}.author`, message: "Article should carry author." });
    }
}

function checkBreadcrumb(node: Node, path: string, out: JsonLdIssue[]): void {
    const items = node.itemListElement;
    if (!Array.isArray(items) || items.length === 0) {
        out.push({ severity: "error", path: `${path}.itemListElement`, message: "BreadcrumbList requires a non-empty itemListElement." });
        return;
    }
    items.forEach((entry, i) => {
        const itemPath = `${path}.itemListElement[${i}]`;
        if (!isObj(entry)) {
            out.push({ severity: "error", path: itemPath, message: "ListItem must be an object." });
            return;
        }
        if (typeof entry.position !== "number") {
            out.push({ severity: "error", path: `${itemPath}.position`, message: "ListItem requires a numeric position." });
        }
        if (!str(entry.name)) {
            out.push({ severity: "error", path: `${itemPath}.name`, message: "ListItem requires a name." });
        }
        if (!str(entry.item)) {
            out.push({ severity: "error", path: `${itemPath}.item`, message: "ListItem requires an item URL." });
        }
    });
}

function checkEvent(node: Node, path: string, out: JsonLdIssue[]): void {
    if (!str(node.name)) {
        out.push({ severity: "error", path: `${path}.name`, message: "Event requires name." });
    }
    if (!str(node.startDate)) {
        out.push({ severity: "error", path: `${path}.startDate`, message: "Event requires startDate." });
    }
    const location = node.location;
    if (!isObj(location) || !str(location.name)) {
        out.push({ severity: "warning", path: `${path}.location.name`, message: "Event should carry a named location." });
    }
}

function checkProduct(node: Node, path: string, out: JsonLdIssue[]): void {
    if (!str(node.name)) {
        out.push({ severity: "error", path: `${path}.name`, message: "Product requires name." });
    }
    if (!node.image) {
        out.push({ severity: "warning", path: `${path}.image`, message: "Product should carry image." });
    }
    const offers = node.offers;
    if (!isObj(offers)) {
        out.push({ severity: "warning", path: `${path}.offers`, message: "Product should carry an Offer for price display." });
        return;
    }
    if (offers.price == null) {
        out.push({ severity: "warning", path: `${path}.offers.price`, message: "Offer has no price (price-on-request listings are ineligible for price display)." });
    }
    if (!str(offers.priceCurrency)) {
        out.push({ severity: "error", path: `${path}.offers.priceCurrency`, message: "Offer requires priceCurrency." });
    }
    if (!str(offers.availability)) {
        out.push({ severity: "warning", path: `${path}.offers.availability`, message: "Offer should carry availability." });
    }
}

function checkNode(node: Node, path: string, out: JsonLdIssue[]): void {
    const type = node["@type"];
    switch (type) {
        case "Article":
        case "NewsArticle":
        case "ImageGallery":
            checkArticle(node, path, out);
            if (type === "ImageGallery" && !Array.isArray(node.associatedMedia)) {
                out.push({ severity: "warning", path: `${path}.associatedMedia`, message: "ImageGallery should carry associatedMedia." });
            }
            return;
        case "BreadcrumbList":
            checkBreadcrumb(node, path, out);
            return;
        case "Event":
            checkEvent(node, path, out);
            return;
        case "Product":
            checkProduct(node, path, out);
            return;
        case "Person":
            if (!str(node.name)) {
                out.push({ severity: "error", path: `${path}.name`, message: "Person requires name." });
            }
            return;
        case "Place":
            if (!str(node.name)) {
                out.push({ severity: "error", path: `${path}.name`, message: "Place requires name." });
            }
            return;
        default:
            return;
    }
}

/** Validates a JSON-LD graph (or { @context, @graph } envelope). */
export function validateJsonLdGraph(graph: unknown): JsonLdIssue[] {
    const out: JsonLdIssue[] = [];
    nodesOf(graph).forEach((node, i) => checkNode(node, `[${i}:${diversity(node)}]`, out));
    return out;
}

function diversity(node: Node): string {
    return typeof node["@type"] === "string" ? (node["@type"] as string) : "?";
}

/** True when no error-severity issues exist (warnings don't fail). */
export function isRichResultsEligible(graph: unknown): boolean {
    return validateJsonLdGraph(graph).every((issue) => issue.severity !== "error");
}
