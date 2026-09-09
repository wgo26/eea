'use client'

import { useState } from 'react'
import { Textarea } from '@/components/ui/textarea'
import { MediaUploader } from '@/components/admin/media-uploader'
import { ToastProvider } from '@/components/admin/toast'

/**
 * Public intake photo field (G3). Signed-in visitors get the drag-drop
 * MediaUploader (uploads go to /api/uploads with destination public_photo);
 * guests keep the plain URL textarea because the upload route requires
 * authentication. Either way the submit action reads the same named field.
 */
export function PhotoUploadField({
  name,
  placeholder,
  canUpload,
  rows = 3,
}: {
  name: string
  placeholder?: string
  canUpload: boolean
  rows?: number
}) {
  const [value, setValue] = useState('')
  const [newPhotos, setNewPhotos] = useState<Parameters<typeof MediaUploader>[0]['newPhotos']>([])

  if (!canUpload) {
    return <Textarea id={name} name={name} placeholder={placeholder} rows={rows} />
  }

  return (
    <ToastProvider>
      <div className="space-y-2">
        <MediaUploader
          newPhotos={newPhotos}
          onChange={({ newPhotos: np }) => {
            setNewPhotos(np)
            setValue(np.map((p) => p.url).filter(Boolean).join('\n'))
          }}
          destination="public_photo"
          showAltCaption={false}
        />
        <Textarea
          id={name}
          name={name}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          rows={rows}
        />
      </div>
    </ToastProvider>
  )
}