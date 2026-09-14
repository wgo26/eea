# Media specs — cover images & video (editors)

Single reference for what fits where. All editorial images render with
`object-cover` (crop, never stretch) through `SmartImage`.

| Surface | Rendered size | Upload recommendation |
|---|---|---|
| Homepage hero (`HeroSlide`) | full-bleed `h-[400px] sm:440 lg:560`, `sizes=100vw` | **Landscape 1920×1080+ (min 1600px wide)**, JPEG/PNG/WebP ≤15MB |
| Grid cards (`StoryCard`) | `aspect-[16/10]` | Same landscape file as hero works |
| Listing cards (`ListingCard`) | `aspect-[4/3]` | Landscape 1200×900+ |
| Admin table thumbs | 40×40 crop | Any — center-cropped |
| Social share (OG/Twitter) | 1200×630 | Hero cover reused when present, else `public/og-default.png` |
| Video/audio embeds | `aspect-video w-full` iframe/player | 16:9 video ≤50MB (`mp4/mov/webm`), audio ≤25MB, PDF ≤10MB |

Notes:

- Portrait/square uploads are center-cropped — prefer landscape at shoot time.
- Uploads are re-encoded to q82 WebP capped at 2560px (PNG stays lossless);
  uploading larger than 2560px wastes bytes.
- Pasted external URLs render as plain lazy `<img>` (no optimizer), same crop.
- First photo = cover; reorder or “Set as cover” in the MediaUploader.