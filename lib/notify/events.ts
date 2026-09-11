/**
 * Notification event catalog — the single list of everything that can page
 * staff or nudge a user. Each event declares its audience and renders
 * bilingual title/body from a data payload.
 *
 * Staff events fan out at SEND time (worker reads the current admin/editor
 * roster + prefs), so this file never hardcodes recipients.
 */

export type NotifyAudience = 'staff' | 'user';

export type NotifyEvent =
  | 'submission.received'
  | 'submission.confirmation'
  | 'submission.approved'
  | 'submission.rejected'
  | 'submission.clarification'
  | 'advertise.inquiry'
  | 'advertise.approved'
  | 'legal.takedown'
  | 'legal.contact'
  | 'legal.data_request'
  | 'content.correction'
  | 'listing.update';

export type NotifyPayload = {
  event: NotifyEvent;
  audience: NotifyAudience;
  /** Required when audience = 'user'. */
  userId?: string | null;
  /** Deep link path (locale-prefixed by the renderer), e.g. '/admin/moderation'. */
  path?: string | null;
  data?: Record<string, string | number | null>;
};

export type RenderedNotify = { title: string; titleFr: string; body: string; bodyFr: string };

const S = (v: string | number | null | undefined, fallback = '—') =>
  v == null || v === '' ? fallback : String(v);

export function renderEvent(payload: NotifyPayload): RenderedNotify {
  const d = payload.data ?? {};
  switch (payload.event) {
    case 'submission.received':
      return {
        title: `New ${S(d.type)} submission needs review`,
        titleFr: `Nouvelle soumission ${S(d.type)} à vérifier`,
        body: `${S(d.title)} — from ${S(d.from)}. Open the moderation queue to review it.`,
        bodyFr: `${S(d.title)} — de ${S(d.from)}. Ouvrez la file de modération pour vérifier.`,
      };
    case 'submission.confirmation':
      return {
        title: 'We received your submission',
        titleFr: 'Nous avons reçu votre soumission',
        body: `${S(d.title)} is now in our editorial queue. We will review it and notify you of the decision here.`,
        bodyFr: `${S(d.title)} est maintenant dans notre file éditoriale. Nous l’examinerons et vous informerons de la décision ici.`,
      };
    case 'submission.approved':
      return {
        title: 'Your submission was published',
        titleFr: 'Votre soumission a été publiée',
        body: `${S(d.title)} is now live on Eagle Eye Africa. Thank you for contributing — share it on WhatsApp!`,
        bodyFr: `${S(d.title)} est maintenant en ligne sur Eagle Eye Africa. Merci pour votre contribution — partagez-la sur WhatsApp !`,
      };
    case 'submission.rejected':
      return {
        title: 'Update on your submission',
        titleFr: 'Nouvelles de votre soumission',
        body: `${S(d.title)} could not be published${d.reason ? `: ${d.reason}` : '.'} You are welcome to submit again.`,
        bodyFr: `${S(d.title)} n’a pas pu être publiée${d.reason ? ` : ${d.reason}` : '.'} N’hésitez pas à soumettre à nouveau.`,
      };
    case 'submission.clarification':
      return {
        title: 'We need a detail on your submission',
        titleFr: 'Un détail manque sur votre soumission',
        body: `Our editors asked: ${S(d.question)} — reply by submitting again or contacting us.`,
        bodyFr: `Nos rédacteurs demandent : ${S(d.question)} — répondez en soumettant à nouveau ou en nous contactant.`,
      };
    case 'advertise.inquiry':
      return {
        title: 'New advertising inquiry',
        titleFr: 'Nouvelle demande publicitaire',
        body: `${S(d.company)} (${S(d.email)}) wants ${S(d.placement)} / ${S(d.format)}. Open the ads inquiries tab.`,
        bodyFr: `${S(d.company)} (${S(d.email)}) souhaite ${S(d.placement)} / ${S(d.format)}. Ouvrez l’onglet des demandes.`,
      };
    case 'advertise.approved':
      return {
        title: 'Your ad campaign is live',
        titleFr: 'Votre campagne est en ligne',
        body: `${S(d.company)} — your campaign is now running on Eagle Eye Africa.`,
        bodyFr: `${S(d.company)} — votre campagne est maintenant diffusée sur Eagle Eye Africa.`,
      };
    case 'legal.takedown':
      return {
        title: 'New copyright takedown request',
        titleFr: 'Nouvelle demande de retrait',
        body: `Claimant ${S(d.from)} filed a takedown${d.url ? ` for ${d.url}` : ''}. Open the legal inbox.`,
        bodyFr: `${S(d.from)} a déposé une demande de retrait${d.url ? ` pour ${d.url}` : ''}. Ouvrez la boîte juridique.`,
      };
    case 'legal.contact':
      return {
        title: 'New contact message',
        titleFr: 'Nouveau message de contact',
        body: `${S(d.from)} wrote about ${S(d.topic)}. Open the legal inbox.`,
        bodyFr: `${S(d.from)} a écrit au sujet de ${S(d.topic)}. Ouvrez la boîte juridique.`,
      };
    case 'legal.data_request':
      return {
        title: 'New privacy/data request',
        titleFr: 'Nouvelle demande de données',
        body: `${S(d.from)} requested ${S(d.type)}. Open the legal inbox.`,
        bodyFr: `${S(d.from)} a demandé ${S(d.type)}. Ouvrez la boîte juridique.`,
      };
    case 'content.correction':
      return {
        title: 'New article correction report',
        titleFr: 'Nouveau signalement de correction',
        body: `A reader reported an issue on ${S(d.title)}. Open trust & safety.`,
        bodyFr: `Un lecteur a signalé un problème sur ${S(d.title)}. Ouvrez confiance & sécurité.`,
      };
    case 'listing.update':
      return {
        title: 'Update on your listing',
        titleFr: 'Nouvelles de votre annonce',
        body: `${S(d.title)}: ${S(d.status)}. Manage it from your listings page.`,
        bodyFr: `${S(d.title)} : ${S(d.status)}. Gérez-la depuis votre page d’annonces.`,
      };
  }
}

/** Staff deep-link defaults per event (admin paths, locale-prefixed at render). */
export function defaultStaffPath(event: NotifyEvent): string {  switch (event) {
    case 'submission.received':
      return '/admin/moderation';
    case 'advertise.inquiry':
    case 'advertise.approved':
      return '/admin/ads?tab=inquiries';
    case 'legal.takedown':
    case 'legal.contact':
    case 'legal.data_request':
      return '/admin/policies';
    case 'content.correction':
      return '/admin/trust-safety';
    default:
      return '/admin/dashboard';
  }
}
