import { loadBrandIdentity } from "@/lib/branding/identity";
import { SITE } from "@/lib/constants";
import {
    getSiteOverviewText,
    MCP_OVERVIEW_TOOL,
    MCP_PROTOCOL_VERSION,
    MCP_SERVER_VERSION,
} from "@/lib/mcp/metadata";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 16 * 1024;
const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
        "Accept, Content-Type, Last-Event-ID, MCP-Protocol-Version, MCP-Session-Id",
    "Access-Control-Expose-Headers": "MCP-Protocol-Version",
    "Cross-Origin-Resource-Policy": "cross-origin",
};

type JsonRpcId = string | number | null;
type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function response(
    payload: JsonObject | null,
    status = 200,
    protocolVersion?: string,
): Response {
    const headers = new Headers(CORS_HEADERS);
    headers.set("Cache-Control", "no-store");
    if (payload) headers.set("Content-Type", "application/json; charset=utf-8");
    if (protocolVersion) headers.set("MCP-Protocol-Version", protocolVersion);
    return new Response(payload ? JSON.stringify(payload) : null, { status, headers });
}

function rpcError(id: JsonRpcId, code: number, message: string, status = 400): Response {
    return response({
        jsonrpc: "2.0",
        id,
        error: { code, message },
    }, status);
}

async function readJsonBody(request: Request): Promise<
    { ok: true; value: unknown } | { ok: false; response: Response }
> {
    const declaredLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
        return { ok: false, response: response({ error: "Request body too large." }, 413) };
    }

    if (!request.body) {
        return { ok: false, response: rpcError(null, -32700, "Request body is required.") };
    }

    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalLength = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalLength += value.byteLength;
        if (totalLength > MAX_BODY_BYTES) {
            await reader.cancel();
            return { ok: false, response: response({ error: "Request body too large." }, 413) };
        }
        chunks.push(value);
    }

    const bytes = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }

    try {
        return { ok: true, value: JSON.parse(new TextDecoder().decode(bytes)) as unknown };
    } catch {
        return { ok: false, response: rpcError(null, -32700, "Parse error.") };
    }
}

function toolListResult(id: JsonRpcId): Response {
    return response({
        jsonrpc: "2.0",
        id,
        result: { tools: [MCP_OVERVIEW_TOOL] },
    }, 200, MCP_PROTOCOL_VERSION);
}

async function handleMcpRequest(request: Request): Promise<Response> {
    const contentType = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
    if (contentType !== "application/json") {
        return response({ error: "Content-Type must be application/json." }, 415);
    }

    const accept = request.headers.get("accept")?.toLowerCase() ?? "";
    if (accept && !accept.includes("application/json")) {
        return response({ error: "Accept must include application/json." }, 406);
    }

    const parsed = await readJsonBody(request);
    if (!parsed.ok) return parsed.response;
    const message = parsed.value;
    if (!isObject(message) || message.jsonrpc !== "2.0" || typeof message.method !== "string") {
        return rpcError(null, -32600, "Invalid Request.");
    }

    const hasId = Object.prototype.hasOwnProperty.call(message, "id");
    const idValue = message.id;
    if (hasId && idValue !== null && typeof idValue !== "string" && typeof idValue !== "number") {
        return rpcError(null, -32600, "Invalid Request.");
    }
    const id: JsonRpcId = hasId ? idValue as JsonRpcId : null;
    const params = message.params === undefined ? {} : message.params;
    if (!isObject(params)) {
        return hasId
            ? rpcError(id, -32602, "Invalid params.")
            : response(null, 202);
    }

    const requestedProtocol = request.headers.get("MCP-Protocol-Version");
    if (
        message.method !== "initialize" &&
        hasId &&
        requestedProtocol !== MCP_PROTOCOL_VERSION
    ) {
        return rpcError(id, -32600, "Missing or unsupported MCP-Protocol-Version.");
    }

    if (message.method === "initialize" && hasId) {
        const clientInfo = params.clientInfo;
        if (
            typeof params.protocolVersion !== "string" ||
            !isObject(params.capabilities) ||
            !isObject(clientInfo) ||
            typeof clientInfo.name !== "string" ||
            typeof clientInfo.version !== "string"
        ) {
            return rpcError(id, -32602, "Invalid initialize parameters.");
        }
        const identity = await loadBrandIdentity();
        return response({
            jsonrpc: "2.0",
            id,
            result: {
                protocolVersion: MCP_PROTOCOL_VERSION,
                capabilities: { tools: { listChanged: false } },
                serverInfo: { name: identity.siteName, version: MCP_SERVER_VERSION },
                instructions: "This endpoint provides public, read-only site information.",
            },
        }, 200, MCP_PROTOCOL_VERSION);
    }

    if (message.method === "notifications/initialized" && !hasId) {
        return response(null, 202);
    }

    if (!hasId) return response(null, 202);
    if (message.method === "ping") {
        return response({ jsonrpc: "2.0", id, result: {} }, 200, MCP_PROTOCOL_VERSION);
    }
    if (message.method === "tools/list") return toolListResult(id);

    if (message.method === "tools/call") {
        if (params.name !== MCP_OVERVIEW_TOOL.name) {
            return rpcError(id, -32602, "Unknown tool.");
        }
        const args = params.arguments === undefined ? {} : params.arguments;
        if (!isObject(args) || Object.keys(args).length > 0) {
            return rpcError(id, -32602, "This tool does not accept arguments.");
        }
        const identity = await loadBrandIdentity();
        return response({
            jsonrpc: "2.0",
            id,
            result: {
                content: [{
                    type: "text",
                    text: getSiteOverviewText(
                        identity.siteName,
                        identity.tagline?.trim() || SITE.description,
                    ),
                }],
            },
        }, 200, MCP_PROTOCOL_VERSION);
    }

    return rpcError(id, -32601, "Method not found.", 200);
}

function methodNotAllowed(): Response {
    const headers = new Headers(CORS_HEADERS);
    headers.set("Allow", "POST, OPTIONS");
    headers.set("Cache-Control", "no-store");
    return new Response(null, { status: 405, headers });
}

export async function POST(request: Request): Promise<Response> {
    return handleMcpRequest(request);
}

export async function GET(): Promise<Response> {
    return methodNotAllowed();
}

export async function DELETE(): Promise<Response> {
    return methodNotAllowed();
}

export async function OPTIONS(): Promise<Response> {
    const headers = new Headers(CORS_HEADERS);
    headers.set("Allow", "POST, OPTIONS");
    return new Response(null, { status: 204, headers });
}
