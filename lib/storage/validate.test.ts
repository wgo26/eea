import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { fileTypeFromBuffer } from 'file-type';
import { validateUpload } from './validate';

/**
 * Low-bandwidth master pipeline (features.md §low-bandwidth): every uploaded
 * photo is re-encoded server-side. These run against real sharp buffers so
 * the format/dimension contract is pinned end-to-end, not mocked.
 */

async function solidImage(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 120, g: 80, b: 60 } },
  })
    .jpeg({ quality: 95 })
    .toBuffer();
}

describe('validateUpload image re-encode', () => {
  it('re-encodes JPEG photos to WebP capped at 2560px', async () => {
    const input = await solidImage(3200, 2400);
    const out = await validateUpload(input, 'image/jpeg', 'public_photo');

    expect(out.kind).toBe('image');
    expect(out.mimeType).toBe('image/webp');
    // 3200x2400 inside 2560x2560 → 2560x1920 (no enlargement, ratio kept)
    expect(out.width).toBe(2560);
    expect(out.height).toBe(1920);
    // The stored master really is WebP bytes, not just a relabelled buffer.
    const sniffed = await fileTypeFromBuffer(out.buffer);
    expect(sniffed?.mime).toBe('image/webp');
  }, { timeout: 15000 });

  it('does not upscale photos smaller than the master ceiling', async () => {
    const input = await solidImage(800, 600);
    const out = await validateUpload(input, 'image/jpeg', 'public_photo');

    expect(out.mimeType).toBe('image/webp');
    expect(out.width).toBe(800);
    expect(out.height).toBe(600);
  });

  it('keeps PNG lossless (transparency: logos, screenshots)', async () => {
    const input = await sharp({
      create: { width: 64, height: 64, channels: 4, background: { r: 0, g: 128, b: 200, alpha: 0.5 } },
    })
      .png()
      .toBuffer();
    const out = await validateUpload(input, 'image/png', 'admin_asset');

    expect(out.mimeType).toBe('image/png');
    expect(out.width).toBe(64);
    expect(out.height).toBe(64);
    const sniffed = await fileTypeFromBuffer(out.buffer);
    expect(sniffed?.mime).toBe('image/png');
  });

  it('rejects executables disguised with an image Content-Type', async () => {
    // MZ header (PE executable) — the sniffed type is not on the allowlist,
    // so it must be rejected regardless of what the client declared.
    const exe = Buffer.concat([Buffer.from([0x4d, 0x5a]), Buffer.alloc(64, 0)]);
    await expect(validateUpload(exe, 'image/jpeg', 'public_photo')).rejects.toThrow();
  });
});
