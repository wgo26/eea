'use client'

import { useState } from 'react'
import { Textarea } from '@/components/ui/textarea'
import { MediaUploader } from '@/components/admin/media-uploader'
import { ToastProvider } from '@/components/admin/toast'

const ACCEPTS = {
  image: 'image/jpeg,image/png,image/webp,image/gif',
  video: 'video/mp4,video/quicktime,video/webm',
  audio: 'audio/mpeg,audio/mp4,audio/wav,audio/ogg,audio/webm',
} as const;

export type MediaFieldKind = 'image' | 'video' | 'audio';

/**
 * Public intake media field (Phase A). Generalizes the old photo-only field:
 * signed-in visitors get the drag-drop uploader filtered to the field's kind
 * (uploads go to /api/uploads with destination public_photo); guests keep
 * the plain URL textarea. Either way the submit action reads the same named
 * field as newline-separated URLs.
 */
export function MediaField({
  name,
  kind,
  placeholder,
  hint,
  canUpload,
  rows = 3,
}: {
  name: string
  kind: MediaFieldKind
  placeholder?: string
  hint?: string
  canUpload: boolean
  rows?: number
}) {
  const [value, setValue] = useState('')
  const [newFiles, setNewFiles] = useState<Parameters<typeof MediaUploader>[0]['newPhotos']>([])

  if (!canUpload) {
    return (
      <div className="space-y-1.5">
        <Textarea id={name} name={name} placeholder={placeholder} rows={rows} />
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
    )
  }

  return (
    <ToastProvider>
      <div className="space-y-2">
        <MediaUploader
          newPhotos={newFiles}
          onChange={({ newPhotos: np }) => {
            setNewFiles(np)
            setValue(np.map((p) => p.url).filter(Boolean).join('\n'))
          }}
          destination="public_photo"
          showAltCaption={kind === 'image'}
          acceptedTypes={ACCEPTS[kind]}
          maxSizeBytes={kind === 'video' ? 50 * 1024 * 1024 : kind === 'audio' ? 25 * 1024 * 1024 : 15 * 1024 * 1024}
          copy={
            kind === 'image'
              ? undefined
              : {
                  label: kind === 'video' ? 'Videos' : 'Audio',
                  hint:
                    kind === 'video'
                      ? 'Upload short clips (max 50 MB) or paste YouTube/Vimeo/file links below.'
                      : 'Upload voice notes or clips (max 25 MB) or paste audio links below.',
                  empty: kind === 'video' ? 'No videos yet.' : 'No audio yet.',
                }
          }
        />
        <Textarea
          id={name}
          name={name}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          rows={rows}
        />
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
    </ToastProvider>
  )
}
