"use client";

import { useEffect, useRef } from "react";
import { writingStats } from "@/lib/content/stats";

export type ProEditorToolbarCopy = {
  bold: string;
  italic: string;
  underline: string;
  strike: string;
  h2: string;
  quote: string;
  alignLeft: string;
  alignCenter: string;
  alignRight: string;
  alignJustify: string;
  bulletList: string;
  orderedList: string;
  link: string;
  image: string;
  statsWords: string;
  statsChars: string;
  statsRead: string;
  statsMin: string;
};

type Props = {
  label: string;
  value: string;
  onChange: (html: string) => void;
  copy: ProEditorToolbarCopy;
  photoUrls?: string[];
  minHeight?: number;
};

/**
 * Pro editor — the WYSIWYG surface behind BilingualBody.
 *
 * Value model stays an HTML string (payloadFromForm + sanitizeBodyHtml +
 * blocks round-trip untouched). Formatting uses execCommand + inline
 * text-align styles only — everything emitted is already in the sanitizer
 * allowlist, so toolbar output survives save by construction.
 */
export function ProEditor({ label, value, onChange, copy, photoUrls = [], minHeight = 220 }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const lastEmitted = useRef<string>(value);

  // External patch (undo / translate / AI apply) refreshes the DOM only when
  // the value actually changed elsewhere — never fights the caret mid-typing.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (value !== lastEmitted.current && value !== el.innerHTML) {
      el.innerHTML = value || "";
      lastEmitted.current = value || "";
    }
  }, [value]);

  // Mount-only initial paint.
  useEffect(() => {
    if (ref.current && !ref.current.innerHTML) {
      ref.current.innerHTML = value || "";
      lastEmitted.current = value || "";
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function emit() {
    const html = ref.current?.innerHTML ?? "";
    lastEmitted.current = html;
    onChange(html);
  }

  function cmd(command: string, arg?: string) {
    ref.current?.focus();
    document.execCommand(command, false, arg ?? undefined);
    emit();
  }

  function align(where: "left" | "center" | "right" | "justify") {
    cmd(where === "left" ? "justifyLeft" : where === "center" ? "justifyCenter" : where === "right" ? "justifyRight" : "justifyFull");
  }

  function insertLink() {
    const url = window.prompt("https://…");
    if (!url) return;
    const clean = url.trim();
    if (!/^https?:\/\//i.test(clean) && !/^mailto:/i.test(clean)) return;
    cmd("createLink", clean);
  }

  function insertImage() {
    const pick = photoUrls.length > 0 ? `\nAttached photos:\n${photoUrls.slice(0, 5).join("\n")}` : "";
    const url = window.prompt(`Image URL (or paste one of the attached photos):${pick}`);
    if (!url?.trim()) return;
    const clean = url.trim().split(/\s+/)[0];
    if (!/^https?:\/\//i.test(clean)) return;
    const alt = window.prompt("Alt text (accessibility — required to publish):") ?? "";
    cmd("insertImage", clean);
    // execCommand leaves the image selected; set alt on the last img as a
    // best-effort (sanitizer keeps alt, PublishReadiness still gates).
    requestAnimationFrame(() => {
      const imgs = ref.current?.querySelectorAll("img");
      const last = imgs?.[imgs.length - 1];
      if (last && !last.getAttribute("alt")) last.setAttribute("alt", alt.trim() || "Story image");
      emit();
    });
  }

  function onKey(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && ["b", "i", "u"].includes(e.key.toLowerCase())) {
      // Let the browser run bold/italic/underline natively, then sync state.
      requestAnimationFrame(emit);
    }
  }

  const stats = writingStats(value || "");
  const btn =
    "rounded-md border border-border bg-background px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground min-h-[32px] min-w-[32px]";
  const group = "flex items-center gap-1 border-r border-border pr-2 last:border-r-0";

  return (
    <div className="grid gap-2">
      <div
        className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/40 p-2"
        role="toolbar"
        aria-label={label}
      >
        <div className={group}>
          <button type="button" className={btn} title={copy.bold} aria-label={copy.bold} onClick={() => cmd("bold")}>
            <strong>B</strong>
          </button>
          <button type="button" className={btn} title={copy.italic} aria-label={copy.italic} onClick={() => cmd("italic")}>
            <em>I</em>
          </button>
          <button type="button" className={btn} title={copy.underline} aria-label={copy.underline} onClick={() => cmd("underline")}>
            <u>U</u>
          </button>
          <button type="button" className={btn} title={copy.strike} aria-label={copy.strike} onClick={() => cmd("strikeThrough")}>
            <s>S</s>
          </button>
        </div>
        <div className={group}>
          <button type="button" className={btn} title={copy.h2} aria-label={copy.h2} onClick={() => cmd("formatBlock", "h2")}>
            H2
          </button>
          <button type="button" className={btn} title={copy.quote} aria-label={copy.quote} onClick={() => cmd("formatBlock", "blockquote")}>
            ❝
          </button>
        </div>
        <div className={group}>
          <button type="button" className={btn} title={copy.alignLeft} aria-label={copy.alignLeft} onClick={() => align("left")}>
            ⇤
          </button>
          <button type="button" className={btn} title={copy.alignCenter} aria-label={copy.alignCenter} onClick={() => align("center")}>
            ⇔
          </button>
          <button type="button" className={btn} title={copy.alignRight} aria-label={copy.alignRight} onClick={() => align("right")}>
            ⇥
          </button>
          <button type="button" className={btn} title={copy.alignJustify} aria-label={copy.alignJustify} onClick={() => align("justify")}>
            ☰
          </button>
        </div>
        <div className={group}>
          <button type="button" className={btn} title={copy.bulletList} aria-label={copy.bulletList} onClick={() => cmd("insertUnorderedList")}>
            •☰
          </button>
          <button type="button" className={btn} title={copy.orderedList} aria-label={copy.orderedList} onClick={() => cmd("insertOrderedList")}>
            1.☰
          </button>
          <button type="button" className={btn} title={copy.link} aria-label={copy.link} onClick={insertLink}>
            🔗
          </button>
          <button type="button" className={btn} title={copy.image} aria-label={copy.image} onClick={insertImage}>
            🖼
          </button>
        </div>
      </div>

      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline
        aria-label={label}
        onInput={emit}
        onKeyDown={onKey}
        onBlur={emit}
        className="w-full rounded-md border border-border bg-background p-3 text-sm leading-relaxed text-foreground focus:outline-none focus:ring-2 focus:ring-ring [&_h2]:text-lg [&_h2]:font-semibold [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_figure]:my-3 [&_img]:max-w-full [&_img]:rounded-md"
        style={{ minHeight }}
      />

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground" role="status">
        <span>
          {copy.statsWords}: <strong className="text-foreground">{stats.words}</strong>
        </span>
        <span>
          {copy.statsChars}: <strong className="text-foreground">{stats.characters}</strong>
        </span>
        <span>
          {copy.statsRead}: <strong className="text-foreground">{stats.readingMinutes} {copy.statsMin}</strong>
        </span>
        <span className="h-1 w-24 overflow-hidden rounded-full bg-muted" aria-hidden>
          <span className="block h-full rounded-full bg-primary transition-all" style={{ width: `${stats.progressPct}%` }} />
        </span>
      </div>
    </div>
  );
}
