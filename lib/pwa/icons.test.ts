import { describe, expect, it } from "vitest";
import sharp from "sharp";

import { PWA_ICON_SPECS, renderPwaIcon } from "./icons";

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe("renderPwaIcon", () => {
    it("rejects unknown icon names", async () => {
        await expect(renderPwaIcon("nope.png", "https://eea.example")).resolves.toBeNull();
    });

    it.each(PWA_ICON_SPECS)(
        "renders $name as a valid $size×$size PNG (built-in fallback when no logo is configured)",
        async ({ name, size }) => {
            const png = await renderPwaIcon(name, "https://eea.example");
            expect(png).not.toBeNull();
            expect(png!.subarray(0, 8)).toEqual(PNG_MAGIC);
            const meta = await sharp(png!).metadata();
            expect(meta.format).toBe("png");
            expect(meta.width).toBe(size);
            expect(meta.height).toBe(size);
        },
    );
});
