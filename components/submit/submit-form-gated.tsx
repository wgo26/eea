import { createClient } from '@/lib/supabase/server'
import { SubmitForm, type SubmitType } from '@/components/submit/submit-form'
import type { Dictionary } from '@/lib/i18n'

/**
 * Server wrapper (G3): resolves the session once so SubmitForm can gate the
 * drag-drop uploader on a signed-in visitor. Guests keep the URL textarea —
 * /api/uploads requires authentication.
 */
export async function SubmitFormGated({ type, dict }: { type: SubmitType; dict: Dictionary }) {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    return <SubmitForm type={type} dict={dict} canUpload={!!data?.user} />;
}