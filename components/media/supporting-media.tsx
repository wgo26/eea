import type { MediaAttachment } from '@/lib/media/attachments';
import { MediaAttachmentView } from '@/components/media/media-attachment';
import { Clapperboard } from 'lucide-react';

/**
 * "Supporting media" section for detail pages (Phase B).
 * Cover image stays where it is; video / audio / documents render here as
 * click-to-play players so a story can carry any combination of formats
 * without changing the editorial layout.
 */
export function SupportingMedia({
  items,
  title,
  heading,
  description,
}: {
  items: MediaAttachment[];
  title: string;
  heading: string;
  description?: string;
}) {
  if (items.length === 0) return null;
  return (
    <section aria-label={heading} className="mt-8">
      <h2 className="flex items-center gap-2 text-base font-bold">
        <Clapperboard className="h-4 w-4 text-primary" aria-hidden />
        {heading} ({items.length})
      </h2>
      {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        {items.map((item) => (
          <MediaAttachmentView key={item.url} attachment={item} title={title} />
        ))}
      </div>
    </section>
  );
}
