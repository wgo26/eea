import { createClient } from '@/lib/supabase/server'
import { SubmitForm, type SubmitType, type SubmitInitial } from '@/components/submit/submit-form'
import type { Dictionary } from '@/lib/i18n'

/**
 * Server wrapper: resolves the session once so SubmitForm can
 * (a) gate the drag-drop uploader on a signed-in visitor, and
 * (b) pre-fill identity + location from the profile so signed-in
 * contributors never retype name/email.
 * Guests keep the URL textarea — /api/uploads requires authentication.
 */
export async function SubmitFormGated({ type, dict }: { type: SubmitType; dict: Dictionary }) {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    const user = data?.user ?? null;

    let initial: SubmitInitial | undefined;
    if (user) {
        const { data: profile } = await supabase
            .from('profiles')
            .select('display_name, full_name, email, phone, location_id')
            .eq('id', user.id)
            .maybeSingle();
        let locationName: string | null = null;
        const locationId = (profile as { location_id?: string | null } | null)?.location_id ?? null;
        if (locationId) {
            const { data: loc } = await supabase
                .from('locations')
                .select('id, name')
                .eq('id', locationId)
                .maybeSingle();
            locationName = (loc as { name?: string } | null)?.name ?? null;
        }
        const p = (profile ?? {}) as { display_name?: string | null; full_name?: string | null; email?: string | null; phone?: string | null };
        initial = {
            name: p.display_name || p.full_name || null,
            email: p.email || user.email || null,
            phone: p.phone || null,
            locationId,
            locationText: locationName,
        };
    }
    return <SubmitForm type={type} dict={dict} canUpload={!!user} initial={initial} />;
}