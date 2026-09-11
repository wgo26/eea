import type { MediaAttachment } from '@/lib/media/attachments';
import { cn } from '@/lib/utils';
import { FileText, Mic, Play } from 'lucide-react';

function isExternal(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

function Embed({ attachment, title }: { attachment: MediaAttachment; title: string }) {
  const url = attachment.url;
  // Known hosted players get an iframe embed; direct files get native players.
  if (/youtube\.com|youtu\.be/i.test(url)) {
    const id = url.match(/(?:v=|youtu\.be\/|embed\/)([\w-]{6,})/)?.[1];
    const src = id ? `https://www.youtube.com/embed/${id}` : url;
    return (
      <iframe
        src={src}
        title={title}
        className="aspect-video w-full"
        loading="lazy"
        allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    );
  }
  if (/vimeo\.com/i.test(url)) {
    const id = url.match(/vimeo\.com\/(\d+)/)?.[1];
    const src = id ? `https://player.vimeo.com/video/${id}` : url;
    return <iframe src={src} title={title} className="aspect-video w-full" loading="lazy" allowFullScreen allow="autoplay; fullscreen; picture-in-picture" />;
  }
  if (/soundcloud\.com|spotify\.com|audiomack\.com/i.test(url)) {
    return (
      <a href={url} target="_blank" rel="noopener" className="flex items-center gap-3 rounded-xl border bg-muted/40 p-4 text-sm hover:bg-muted/60">
        <Mic className="h-5 w-5 shrink-0 text-primary" aria-hidden />
        <span className="min-w-0">
          <span className="block truncate font-medium">{title}</span>
          <span className="block truncate text-xs text-muted-foreground">{url}</span>
        </span>
      </a>
    );
  }
  if (attachment.kind === 'video') {
    return (
      // Click-to-play by design: preload="none" + poster-less keeps the
      // low-bandwidth promise (features.md §low-bandwidth). No autoplay.
      <video controls preload="none" playsInline className="max-h-[480px] w-full rounded-xl bg-black">
        <source src={url} />
        <a href={url} target="_blank" rel="noopener" className="underline">Open video</a>
      </video>
    );
  }
  if (attachment.kind === 'audio') {
    return <audio controls preload="none" src={url} className="w-full" />;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={attachment.alt ?? title} loading="lazy" className="h-full w-full object-cover" />;
}

/**
 * Single supporting-media attachment (video / audio / document / image).
 * Images render as thumbnails; video/audio use native players with
 * click-to-play (no autoplay, preload="none") for the mobile-first audience.
 */
export function MediaAttachmentView({ attachment, title }: { attachment: MediaAttachment; title: string }) {
  if (attachment.kind === 'document') {
    return (
      <a
        href={attachment.url}
        target="_blank"
        rel="noopener"
        className="flex items-center gap-3 rounded-xl border bg-card p-4 text-sm transition-colors hover:bg-muted/40"
      >
        <FileText className="h-5 w-5 shrink-0 text-primary" aria-hidden />
        <span className="min-w-0">
          <span className="block truncate font-medium">{attachment.caption || title}</span>
          <span className="block text-xs text-muted-foreground">Document — opens in a new tab</span>
        </span>
      </a>
    );
  }
  return (
    <figure className="overflow-hidden rounded-xl border bg-muted/20">
      <Embed attachment={attachment} title={attachment.caption || title} />
      {attachment.caption || attachment.credit ? (
        <figcaption className="px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          {attachment.caption}
          {attachment.caption && attachment.credit ? ' — ' : ''}
          {attachment.credit ? <span>{attachment.credit}</span> : null}
        </figcaption>
      ) : null}
    </figure>
  );
}

/** Badge shown on cards when a story carries video/audio. */
export function MediaBadge({ kind, className }: { kind: 'video' | 'audio'; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur',
        className,
      )}
    >
      {kind === 'video' ? <Play className="h-3 w-3" aria-hidden /> : <Mic className="h-3 w-3" aria-hidden />}
      {kind === 'video' ? 'Video' : 'Audio'}
    </span>
  );
}

export function isValidMediaUrl(url: string): boolean {
  return isExternal(url);
}
