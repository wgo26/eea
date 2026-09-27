// One-off: named pack constant + explicit default export for every pack file,
// clearing eslint's import/no-anonymous-default-export.
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const roots = ["presets/config", "presets/taxonomy", "presets/automation"];
for (const dir of roots) {
    for (const f of readdirSync(dir)) {
        if (!f.endsWith(".mjs")) continue;
        const p = join(dir, f);
        let s = readFileSync(p, "utf8");
        if (s.includes("export default pack;")) continue; // already converted
        if (!s.includes("export default {")) continue;
        s = s.replace("export default {", "const pack = {");
        s = s.replace(/\};\s*$/, "};\n\nexport default pack;\n");
        writeFileSync(p, s, "utf8");
        console.log("converted", p);
    }
}
