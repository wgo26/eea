/**
 * A6 — generated database types for lib/supabase/database.types.ts.
 *
 * The Supabase CLI needs Docker or a stored access token (`supabase gen
 * types`); neither is guaranteed on contributor machines, so this script
 * builds the same `Database` shape from sources that need neither:
 *
 *   - Columns (Row/Insert/Update) and enums come from the repo's migration
 *     DDL — the authoritative schema. The project's PostgREST OpenAPI
 *     description over-reports NOT NULL (`required` there means "always
 *     returned", e.g. `advertisers.email` is nullable in DDL yet listed as
 *     required), so DDL wins wherever both cover a column.
 *   - JSON columns (`jsonb`) would otherwise degrade to `string`; the spec is
 *     consulted purely as a typing supplement for that.
 *   - Relationships come from the spec's `<fk table=… column=…/>` notes when
 *     available, otherwise from the DDL's `references` clauses.
 *   - Functions (rpc args + Returns) are parsed from the migration DDL; the
 *     spec's snapshot carries no /rpc/ paths.
 *
 * Output is deterministic and committed; CI regenerates and fails when the
 * committed file drifts from the schema (schema-drift gate).
 *
 * Usage:
 *   node scripts/generate-database-types.mjs            # write the file
 *   node scripts/generate-database-types.mjs --check    # exit 1 on drift
 *   node scripts/generate-database-types.mjs --url https://… --key k
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_PATH = join(root, "lib", "supabase", "database.types.ts");
const MIGRATIONS_DIR = join(root, "supabase", "migrations");

const argv = process.argv.slice(2);
const checkOnly = argv.includes("--check");
const urlArg = argv.includes("--url") ? argv[argv.indexOf("--url") + 1] : undefined;
const keyArg = argv.includes("--key") ? argv[argv.indexOf("--key") + 1] : undefined;

const restUrl = urlArg ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? readEnv("NEXT_PUBLIC_SUPABASE_URL") ?? "";
// The OpenAPI root (/rest/v1/) rejects the publishable key — use the service key.
const restKey =
    keyArg ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    readEnv("SUPABASE_SERVICE_ROLE_KEY") ??
    readEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY") ??
    "";

/** Minimal .env reader (no dotenv dependency). */
function readEnv(name) {
    try {
        const line = readFileSync(join(root, ".env"), "utf8")
            .split(/\r?\n/)
            .find((l) => l.startsWith(`${name}=`));
        return line ? line.slice(name.length + 1).trim() : null;
    } catch {
        return null;
    }
}

function fail(message) {
    console.error(`ERROR: ${message}`);
    process.exit(1);
}

function migrationFiles() {
    return readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
}

// ---------------------------------------------------------------------------
// Emission
// ---------------------------------------------------------------------------
/**
 * One `Tables` entry, matching the Supabase CLI's emission rules:
 *   Row:    NOT NULL → plain type; nullable (no NOT NULL, no default) → `| null`
 *   Insert: required only when NOT NULL *and* defaultless; everything else
 *           gets `?` (optional, omittable) plus `| null` when nullable
 *   Update: every property optional and nullable
 */
function emitTableBlock(name, columns, relationships) {
    const rowLines = [];
    const insertLines = [];
    const updateLines = [];

    for (const { propName, base, notNull, hasDefault } of columns) {
        const nullable = !notNull;
        rowLines.push(`            ${propName}: ${base}${nullable ? " | null" : ""};`);

        if (notNull && !hasDefault) {
            insertLines.push(`            ${propName}: ${base};`);
        } else {
            insertLines.push(`            ${propName}?: ${base}${nullable ? " | null" : ""};`);
        }

        updateLines.push(`            ${propName}?: ${base} | null;`);
    }

    const relBlock =
        relationships.length === 0
            ? "            Relationships: [];"
            : `            Relationships: [\n${relationships
                  .map(
                      (r) =>
                          `                {\n                    foreignKeyName: "${r.foreignKeyName}",\n                    columns: [${r.columns
                              .map((c) => JSON.stringify(c))
                              .join(", ")}],\n                    isOneToOne: false,\n                    referencedRelation: "${r.referencedRelation}",\n                    referencedColumns: [${r.referencedColumns
                              .map((c) => JSON.stringify(c))
                              .join(", ")}],\n                },`,
                  )
                  .join("\n")}\n            ];`;

    return `        ${name}: {\n            Row: {\n${rowLines.join("\n")}\n            };\n            Insert: {\n${insertLines.join("\n")}\n            };\n            Update: {\n${updateLines.join("\n")}\n            };\n${relBlock}\n        }`;
}

// ---------------------------------------------------------------------------
// Migration DDL (authoritative schema)
// ---------------------------------------------------------------------------
/** `create type public.x as enum ('a','b')` → { x: ["a","b"] }. */
function parseDdlEnums() {
    const enums = {};
    for (const file of migrationFiles()) {
        const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
        for (const m of sql.matchAll(/create\s+type\s+public\.(\w+)\s+as\s+enum\s*\(([^)]*)\)/gi)) {
            const values = [...m[2].matchAll(/'((?:[^']|'')*)'/g)].map((v) => v[1].replace(/''/g, "'"));
            if (values.length > 0) enums[m[1]] = values;
        }
    }
    return enums;
}

/** Split a comma list at top level. A mini-scanner tracks line comments
 * (`--` … newline, stripped) and single-quoted strings (only outside
 * comments), so neither a prose apostrophe in a comment nor a
 * `default '{}'::jsonb` literal can split the list at the wrong comma. */
function splitTopLevel(list) {
    const parts = [];
    let depth = 0;
    let quote = false;
    let lineComment = false;
    let current = "";
    for (let i = 0; i < list.length; i++) {
        const ch = list[i];
        if (lineComment) {
            if (ch === "\n") lineComment = false;
            continue;
        }
        if (quote) {
            current += ch;
            if (ch === "'") {
                // SQL escapes a quote by doubling it — '' stays inside the literal.
                if (list[i + 1] === "'") {
                    current += "'";
                    i++;
                } else {
                    quote = false;
                }
            }
            continue;
        }
        if (ch === "-" && list[i + 1] === "-") {
            lineComment = true;
            i++;
            continue;
        }
        if (ch === "'") {
            quote = true;
            current += ch;
            continue;
        }
        if (ch === "(") depth++;
        if (ch === ")") depth--;
        if (ch === "," && depth === 0) {
            parts.push(current);
            current = "";
        } else {
            current += ch;
        }
    }
    if (current.trim()) parts.push(current);
    return parts;
}

/** Body of the `( … )` that starts at `openIndex` (balanced-paren aware). */
function readParenBody(sql, openIndex) {
    let depth = 0;
    for (let i = openIndex; i < sql.length; i++) {
        if (sql[i] === "(") depth++;
        else if (sql[i] === ")") {
            depth--;
            if (depth === 0) return sql.slice(openIndex + 1, i);
        }
    }
    return sql.slice(openIndex + 1);
}

/** pg_type → TS mapping for DDL column/RPC types (Json for json/jsonb). */
function pgTypeToTs(pgType) {
    const t = pgType.trim().toLowerCase().replace(/\s+/g, " ");
    if (t.endsWith("[]")) return `${pgTypeToTs(t.slice(0, -2))}[]`;
    switch (t) {
        case "integer":
        case "int":
        case "bigint":
        case "smallint":
        case "numeric":
        case "real":
        case "double precision":
            return "number";
        case "boolean":
            return "boolean";
        case "json":
        case "jsonb":
            return "Json";
        default:
            return "string";
    }
}

/** `"name" uuid not null default gen_random_uuid()` → column descriptor. */
function parseColumnDef(line, enums) {
    const cleaned = line.replace(/--.*$/gm, "").trim().replace(/,$/, "").trim();
    if (!cleaned) return null;
    if (/^(primary\s+key|foreign\s+key|unique|check|constraint|exclude)\b/i.test(cleaned)) return null;

    const cm = cleaned.match(/^"?([a-zA-Z_][\w]*)"?\s+([\s\S]+)$/);
    if (!cm) return null;
    const [, name, rest] = cm;

    let typeStr = "";
    let cursor = 0;
    for (const tok of rest.match(/\S+\s*|\S+$/g) ?? []) {
        if (/^(not|null|default|references|generated|primary|unique|check|constraint|collate)\b/i.test(tok)) break;
        typeStr += tok;
        cursor += tok.length;
    }
    const modifiers = rest.slice(cursor);
    const bare = typeStr.replace(/\([^)]*\)/g, "").trim().toLowerCase();
    const base = enums[bare] ? enums[bare].map((v) => JSON.stringify(v)).join(" | ") : pgTypeToTs(bare);
    const fk = modifiers.match(/references\s+(?:public\.)?(\w+)\s*\(\s*"?([\w]+)"?\s*\)/i);

    return {
        name,
        base,
        notNull: /\bnot\s+null\b/i.test(modifiers) || /\bprimary\s+key\b/i.test(modifiers),
        hasDefault: /\bdefault\b/i.test(modifiers) || /\bgenerated\b/i.test(modifiers),
        fk: fk ? { table: fk[1], column: fk[2] } : null,
    };
}

/** Table-level `primary key (a, b)` column names. */
function tableLevelPk(body) {
    const cols = [];
    for (const m of body.matchAll(/primary\s+key\s*\(([^)]*)\)/gi)) {
        for (const c of m[1].split(",")) cols.push(c.trim().replace(/"/g, ""));
    }
    return cols;
}

function emitEnumBlock(name, values) {
    return `        ${name}: {\n            Enum: (\n${values
        .map((v) => `                | ${JSON.stringify(v)}`)
        .join("\n")}\n            );\n        }`;
}

/**
 * One `Views` entry. Views are read-only for this project (no INSTEAD OF
 * triggers), so they carry `Row` + `Relationships` only; columns come from
 * the REST spec, where `required` genuinely means "always returned".
 */
function emitViewBlock(name, columns, relationships) {
    const rowLines = columns.map(
        ({ propName, base, notNull }) => `            ${propName}: ${base}${notNull ? "" : " | null"};`,
    );
    const relBlock =
        relationships.length === 0
            ? "            Relationships: [];"
            : `            Relationships: [\n${relationships
                  .map(
                      (r) =>
                          `                {\n                    foreignKeyName: "${r.foreignKeyName}",\n                    columns: [${r.columns
                              .map((c) => JSON.stringify(c))
                              .join(", ")}],\n                    isOneToOne: false,\n                    referencedRelation: "${r.referencedRelation}",\n                    referencedColumns: [${r.referencedColumns
                              .map((c) => JSON.stringify(c))
                              .join(", ")}],\n                },`,
                  )
                  .join("\n")}\n            ];`;
    return `        ${name}: {\n            Row: {\n${rowLines.join("\n")}\n            };\n${relBlock}\n        }`;
}

/** `alter table` statements that change columns (add/alter/drop/rename). */
function applyAlters(sql, tables, enums) {
    // Line-anchored headers (never matches dynamic SQL inside function bodies),
    // then every clause of the statement up to its terminating `;`.
    for (const m of sql.matchAll(/^[ \t]*alter\s+table\s+(?:if\s+exists\s+)?public\.(\w+)\b/gim)) {
        const table = tables.get(m[1]);
        const start = m.index + m[0].length;
        const end = sql.indexOf(";", start);
        const body = sql.slice(start, end === -1 ? sql.length : end);
        if (!table) continue;

        // One statement can carry many clauses: `add column a …, add column b …`.
        for (const clause of splitTopLevel(body)) {
            const text = clause.replace(/--.*$/gm, "").trim();
            if (!text) continue;

            let cm = text.match(/^add\s+column\s+(?:if\s+not\s+exists\s+)?"?([\w]+)"?\s+([\s\S]*)$/i);
            if (cm) {
                const col = parseColumnDef(`${cm[1]} ${cm[2]}`, enums);
                if (!col) continue;
                const index = table.columns.findIndex((c) => c.name === col.name);
                if (index >= 0) table.columns[index] = col;
                else table.columns.push(col);
                if (col.fk) {
                    table.rels.push({
                        columns: [col.name],
                        referencedRelation: col.fk.table,
                        referencedColumns: [col.fk.column],
                    });
                }
                continue;
            }

            cm = text.match(/^alter\s+column\s+"?([\w]+)"?\s+(set\s+not\s+null|drop\s+not\s+null|set\s+default[\s\S]*|drop\s+default)/i);
            if (cm) {
                const column = table.columns.find((c) => c.name === cm[1]);
                if (!column) continue;
                const action = cm[2].toLowerCase();
                if (action.startsWith("set not null")) column.notNull = true;
                else if (action.startsWith("drop not null")) column.notNull = false;
                else if (action.startsWith("set default")) column.hasDefault = true;
                else if (action.startsWith("drop default")) column.hasDefault = false;
                continue;
            }

            cm = text.match(/^drop\s+column\s+(?:if\s+exists\s+)?"?([\w]+)"?/i);
            if (cm) {
                table.columns = table.columns.filter((c) => c.name !== cm[1]);
                continue;
            }

            cm = text.match(/^rename\s+column\s+"?([\w]+)"?\s+to\s+"?([\w]+)"?/i);
            if (cm) {
                const column = table.columns.find((c) => c.name === cm[1]);
                if (column) column.name = cm[2];
            }
        }
    }
}

/** Every `create table` + `alter table` across the migrations, in order. */
function parseDdlTables(enums) {
    const tables = new Map();
    for (const file of migrationFiles()) {
        const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
        for (const m of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?public\.(\w+)\s*\(/gi)) {
            const body = readParenBody(sql, m.index + m[0].length - 1);
            const columns = [];
            const rels = [];
            for (const raw of splitTopLevel(body)) {
                const col = parseColumnDef(raw, enums);
                if (!col) continue;
                columns.push(col);
                if (col.fk) {
                    rels.push({
                        columns: [col.name],
                        referencedRelation: col.fk.table,
                        referencedColumns: [col.fk.column],
                    });
                }
            }
            const pk = new Set(tableLevelPk(body));
            for (const col of columns) if (pk.has(col.name)) col.notNull = true;
            tables.set(m[1], { columns, rels });
        }
        applyAlters(sql, tables, enums);
    }
    return tables;
}

// ---------------------------------------------------------------------------
// PostgREST spec (JSON typing + relationship metadata supplement)
// ---------------------------------------------------------------------------
async function fetchRestSchema() {
    if (!restUrl || !restKey) {
        console.warn(
            "WARN: NEXT_PUBLIC_SUPABASE_URL / key not set — generating from migration DDL only " +
                "(jsonb columns and FK relationships degrade gracefully).",
        );
        return {};
    }
    const res = await fetch(`${restUrl.replace(/\/$/, "")}/rest/v1/`, {
        headers: { apikey: restKey, Authorization: `Bearer ${restKey}` },
    });
    if (!res.ok) {
        console.warn(`WARN: REST /rest/v1/ returned ${res.status} — falling back to migration DDL only.`);
        return {};
    }
    return res.json();
}

/** Pull only what the spec is trustworthy for: jsonb typing, enums, FK notes. */
function specSupplement(spec) {
    const meta = {};
    const rels = {};
    const enums = {};
    const FK_RE = /<fk table='([^']+)' column='([^']+)'\/>/g;

    for (const [name, def] of Object.entries(spec.definitions ?? {})) {
        const columnMeta = {};
        for (const [column, prop] of Object.entries(def.properties ?? {})) {
            columnMeta[column] = { json: prop.format === "json" || prop.format === "jsonb" };
            if (
                Array.isArray(prop.enum) &&
                prop.enum.length > 0 &&
                typeof prop.format === "string" &&
                prop.format.startsWith("public.")
            ) {
                enums[prop.format.slice("public.".length)] = prop.enum;
            }
            const description = typeof prop.description === "string" ? prop.description : "";
            for (const m of description.matchAll(FK_RE)) {
                (rels[name] ??= []).push({
                    columns: [column],
                    referencedRelation: m[1],
                    referencedColumns: [m[2]],
                });
            }
        }
        meta[name] = columnMeta;
    }

    return { meta, rels, enums };
}

/** Migration DDL (authoritative) + spec supplement → Tables/Enums source. */
function buildTableTypes(spec) {
    const enums = parseDdlEnums();
    const { meta, rels: specRels, enums: specEnums } = specSupplement(spec);
    for (const [name, values] of Object.entries(specEnums)) enums[name] = enums[name] ?? values;

    const ddl = parseDdlTables(enums);
    const names = [...new Set([...ddl.keys(), ...Object.keys(spec.definitions ?? {})])].sort();
    const tableBlocks = [];
    const viewBlocks = [];

    for (const name of names) {
        const table = ddl.get(name);
        // Relations with no `create table` are database views (public_profiles,
        // public_listings_safe, poll_results): read-only, typed from the spec.
        if (!table || table.columns.length === 0) {
            const def = spec.definitions?.[name];
            if (!def) {
                console.warn(`WARN: ${name} could not be typed (no DDL or spec definition) — skipped.`);
                continue;
            }
            const required = new Set(def.required ?? []);
            const columns = Object.entries(def.properties ?? {}).map(([propName, prop]) => ({
                propName,
                base: meta[name]?.[propName]?.json ? "Json" : specScalarType(prop, enums),
                notNull: required.has(propName),
            }));
            const relationships = (specRels[name] ?? []).map((r) => ({
                foreignKeyName: `public_${name}_${r.columns.join("_")}_fkey`,
                ...r,
            }));
            viewBlocks.push(emitViewBlock(name, columns, relationships));
            continue;
        }

        const columns = table.columns.map((col) => ({
            propName: col.name,
            base: meta[name]?.[col.name]?.json ? "Json" : col.base,
            notNull: col.notNull,
            hasDefault: col.hasDefault,
        }));

        const source = specRels[name]?.length ? specRels[name] : table.rels;
        const relationships = source.map((r) => ({
            foreignKeyName: `public_${name}_${r.columns.join("_")}_fkey`,
            ...r,
        }));

        tableBlocks.push(emitTableBlock(name, columns, relationships));
    }

    const enumBlocks = Object.entries(enums)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, values]) => emitEnumBlock(name, values));

    return { enumBlocks, tableBlocks, viewBlocks };
}

/** PostgREST property → TS (enums inline, arrays, Json) for view columns. */
function specScalarType(prop, enums) {
    if (Array.isArray(prop.enum) && prop.enum.length > 0) {
        return prop.enum.map((v) => JSON.stringify(v)).join(" | ");
    }
    if (typeof prop.format === "string" && prop.format.startsWith("public.")) {
        const values = enums[prop.format.slice("public.".length)];
        if (Array.isArray(values) && values.length > 0) {
            return values.map((v) => JSON.stringify(v)).join(" | ");
        }
    }
    if (prop.type === "array") return `${specScalarType(prop.items ?? {}, enums)}[]`;
    return pgTypeToTs(prop.format ?? "text");
}

// ---------------------------------------------------------------------------
// Functions (rpc signatures) parsed from migration DDL
// ---------------------------------------------------------------------------
/**
 * Global scan for `create [or replace] function public.name(args) returns …`.
 * The header + args + returns clause never contain a top-level `;`, so one
 * lazy global regex finds every definition; later migrations overwrite
 * earlier ones (CREATE OR REPLACE). Dollar-quoted bodies are never entered.
 */
const CREATE_FN_RE =
    /create\s+(?:or\s+replace\s+)?function\s+public\.(\w+)\s*\(([\s\S]*?)\)\s*returns\s+(?:table\s*\(([\s\S]*?)\)|(setof\s+)?([\w\s."'[\]]+?))\s*(?=language\b|security\b|as\b|with\b)/gi;

/** Parse `p_name type [default …]` pairs out of a parameter list. */
function parseArgs(argList) {
    if (!argList?.trim()) return [];
    return splitTopLevel(argList)
        .map((raw) => {
            const m = raw.trim().match(
                /^(?:in(?:out)?\s+|out\s+|variadic\s+)?([a-zA-Z_][\w]*)\s+([\w\s."'[\]]+?)\s*(?:default\s+([^,]+))?$/i,
            );
            if (!m) return null;
            const [, name, type, defaultExpr] = m;
            const optional = /default\s/i.test(raw);
            // `default null` makes the parameter nullable as well as optional —
            // callers may pass NULL explicitly (PostgREST forwards it as the RPC
            // default), so the generated TS must admit `| null`, not merely omit.
            const nullableDefault = optional && /\bnull\b/i.test(defaultExpr ?? "");
            return {
                name: name.trim(),
                type: pgTypeToTs(type),
                optional,
                nullableDefault,
            };
        })
        .filter(Boolean);
}

/** `returns table (name type, …)` → `Returns: { … }[]` source. */
function tableReturnsToTs(cols) {
    const lines = splitTopLevel(cols)
        .map((raw) => raw.trim().match(/^([a-zA-Z_][\w]*)\s+([\w\s."'[\]]+?)\s*$/i))
        .filter(Boolean)
        .map(([, name, type]) => `                ${name}: ${pgTypeToTs(type)};`)
        .join("\n");
    return `            Returns: {\n${lines}\n            }[];`;
}

/** Extract every public function signature from the migrations (later wins). */
function collectFunctions() {
    const functions = {};
    for (const file of migrationFiles()) {
        const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
        for (const m of sql.matchAll(CREATE_FN_RE)) {
            const [, name, argList, tableCols, setof, scalar] = m;
            if (scalar && scalar.trim().toLowerCase() === "trigger") continue; // not rpc-callable
            let returns;
            if (tableCols !== undefined) {
                returns = tableReturnsToTs(tableCols);
            } else if (setof) {
                returns = `            Returns: ${pgTypeToTs(scalar ?? "void")}[];`;
            } else if (scalar && scalar.trim().toLowerCase() === "void") {
                returns = "            Returns: undefined;";
            } else {
                returns = `            Returns: ${pgTypeToTs(scalar ?? "unknown")};`;
            }
            functions[name] = { args: parseArgs(argList), returns };
        }
    }
    return functions;
}

function buildFunctionBlocks(functions) {
    return Object.entries(functions)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, { args, returns }]) => {
            const argsBlock =
                args.length === 0
                    ? "            Args: Record<string, never>;"
                    : `            Args: {\n${args
                          .map(
                              ({ name: argName, type, optional, nullableDefault }) =>
                                  `                ${argName}${optional ? "?" : ""}: ${type}${nullableDefault ? " | null" : ""};`,
                          )
                          .join("\n")}\n            };`;
            return `        ${name}: {\n${argsBlock}\n${returns}\n        }`;
        });
}

// ---------------------------------------------------------------------------
// Render + write (or check)
// ---------------------------------------------------------------------------
async function main() {
    const spec = await fetchRestSchema();
    const { enumBlocks, tableBlocks, viewBlocks } = buildTableTypes(spec);
    const functionBlocks = buildFunctionBlocks(collectFunctions());

    const output = `export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

/**
 * A6 — GENERATED FILE. Do not edit by hand.
 * Regenerate with: node scripts/generate-database-types.mjs
 * Sources: migration DDL (authoritative columns/enums/rpcs) + PostgREST OpenAPI
 * description (jsonb typing + FK relationships).
 * CI fails when this file drifts from the schema: node scripts/generate-database-types.mjs --check
 */

export type Database = {
    public: {
        Enums: {
${enumBlocks.join("\n")}
        };
        Tables: {
${tableBlocks.join("\n")}
        };
        Views: {
${viewBlocks.length > 0 ? viewBlocks.join("\n") : "            [_ in never]: never;"}
        };
        Functions: {
${functionBlocks.join("\n")}
        };
    };
};
`;

    if (checkOnly) {
        let existing = "";
        try {
            existing = readFileSync(OUT_PATH, "utf8");
        } catch {
            fail(`${OUT_PATH} does not exist. Run the generator without --check first.`);
        }
        if (existing.trim() !== output.trim()) {
            console.error("database.types.ts is out of date with the schema.");
            console.error("Run: node scripts/generate-database-types.mjs");
            process.exit(1);
        }
        console.log("database.types.ts matches the schema.");
        return;
    }

    writeFileSync(OUT_PATH, output, "utf8");
    console.log(
        `Wrote ${OUT_PATH} (${tableBlocks.length} tables, ${enumBlocks.length} enums, ` +
            `${functionBlocks.length} functions).`,
    );
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)));