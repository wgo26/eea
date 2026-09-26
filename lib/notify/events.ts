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
  | 'content.updated'
  | 'listing.update'
  | 'event.reminder'
  | 'poll.closed'
  | 'plan.failed'
  | 'translation.gap'
  | 'content.milestone'
  | 'contributor.milestone'
  | 'correction.resolved'
  | 'digest.ready_for_review'
  | 'credential.hygiene'
  | 'storage.hygiene'
  | 'security.critical'
  | 'system.degraded';

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

/**
 * E8 — turn a moderator's rejection reason into one actionable next step.
 * Keyword matching (not exact strings) because reasons are free text typed by
 * humans; the first match wins. Returns null when nothing applies, so the
 * rejected body stays exactly as written.
 */
const REJECTION_TIPS: { match: RegExp; en: string; fr: string }[] = [
  {
    match: /photo|image|picture|blurry|quality|visual/i,
    en: 'You can resubmit with sharper, well-lit photos and a short caption for each.',
    fr: 'Vous pouvez resoumettre avec des photos plus nettes et bien éclairées, légendées.',
  },
  {
    match: /source|evidence|link|verify|prove/i,
    en: 'You can resubmit and include links or documents that confirm the facts.',
    fr: 'Vous pouvez resoumettre en joignant des liens ou documents qui confirment les faits.',
  },
  {
    match: /duplicate|already|exists|repost/i,
    en: 'This story is already on the site — consider an update with new details instead.',
    fr: 'Cette histoire est déjà sur le site — proposez plutôt une mise à jour avec de nouveaux détails.',
  },
  {
    match: /off.?topic|not relevant|wrong|category|section/i,
    en: 'You can resubmit it to the section that fits the story.',
    fr: 'Vous pouvez la resoumettre dans la rubrique qui correspond au sujet.',
  },
  {
    match: /short|incomplete|detail|context|too little/i,
    en: 'Add who, where, when and what happened next so editors can publish it as is.',
    fr: 'Précisez qui, où, quand et la suite des faits pour que la rédaction puisse publier tel quel.',
  },
  {
    match: /language|english|french|translat|grammar/i,
    en: 'Write in English or French, or ask a friend to help with the wording.',
    fr: 'Écrivez en anglais ou en français, ou faites-vous aider pour la rédaction.',
  },
];

export function rejectionTip(reason: string): { en: string; fr: string } | null {
  for (const tip of REJECTION_TIPS) {
    if (tip.match.test(reason)) return { en: tip.en, fr: tip.fr };
  }
  return null;
}

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
    case 'submission.rejected': {
      // E8 — actionable next step derived from the moderator's free-text reason.
      const tip = typeof d.reason === 'string' ? rejectionTip(d.reason) : null;
      return {
        title: 'Update on your submission',
        titleFr: 'Nouvelles de votre soumission',
        body: `${S(d.title)} could not be published${d.reason ? `: ${d.reason}` : '.'} You are welcome to submit again.${tip ? `\n\nTip: ${tip.en}` : ''}`,
        bodyFr: `${S(d.title)} n’a pas pu être publiée${d.reason ? ` : ${d.reason}` : '.'} N’hésitez pas à soumettre à nouveau.${tip ? `\n\nConseil : ${tip.fr}` : ''}`,
      };
    }
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
    case 'event.reminder':
      return {
        title: 'Event starting soon',
        titleFr: 'Événement imminent',
        body: `${S(d.title)} starts ${S(d.when)}. Don't miss it!`,
        bodyFr: `${S(d.title)} commence ${S(d.when)}. Ne le manquez pas !`,
      };
    case 'plan.failed':
      return {
        title: 'Release plan failed',
        titleFr: 'Échec d’un plan de publication',
        body: `The plan ${S(d.name)} failed to compile${d.error ? `: ${d.error}` : '.'} Check the automations panel.`,
        bodyFr: `Le plan ${S(d.name)} n’a pas pu compiler${d.error ? ` : ${d.error}` : '.'} Vérifiez le panneau d’automatisations.`,
      };
    case 'translation.gap':
      return {
        title: 'French translation needed',
        titleFr: 'Traduction française nécessaire',
        body: `${S(d.count)} published ${Number(d.count) === 1 ? 'story' : 'stories'} lack a French version. Filed in the translation queue.`,
        bodyFr: `${S(d.count)} histoire(s) publiée(s) manquent de version française. Placées dans la file de traduction.`,
      };
    case 'content.milestone':
      return {
        title: 'Community milestone',
        titleFr: 'Palier communautaire',
        body: `${S(d.title)} reached ${S(d.pct)}% of its goal — worth amplifying today.`,
        bodyFr: `${S(d.title)} a atteint ${S(d.pct)} % de son objectif — à relayer aujourd’hui.`,
      };
    case 'contributor.milestone':
      return {
        title: 'A publishing milestone',
        titleFr: 'Un cap de publication',
        body: `You have published ${S(d.count)} stories on Eagle Eye Africa. Thank you for keeping the community informed!`,
        bodyFr: `Vous avez publié ${S(d.count)} histoires sur Eagle Eye Africa. Merci de tenir la communauté informée !`,
      };
    case 'correction.resolved':
      return {
        title: 'An article you engaged with was updated',
        titleFr: 'Un article que vous avez suivi a été mis à jour',
        body: `${S(d.title)} was corrected after a reader report. Read the current version.`,
        bodyFr: `${S(d.title)} a été corrigé après le signalement d’un lecteur. Lisez la version actuelle.`,
      };
    case 'content.updated':
      return {
        title: 'An article you engaged with was updated',
        titleFr: 'Un article que vous avez suivi a été mis à jour',
        body: `${S(d.title)} was updated${d.reason ? `: ${d.reason}` : '.'} Read the latest version.`,
        bodyFr: `${S(d.title)} a été mis à jour${d.reason ? ` : ${d.reason}` : '.'} Lisez la version la plus récente.`,
      };
    case 'digest.ready_for_review':
      return {
        title: 'A recap draft is ready for review',
        titleFr: 'Un brouillon de récapitulatif est prêt à être relu',
        body: `${S(d.template)} compiled ${S(d.count, '999')} new item(s) into a draft. Open the templates page to review and publish.`,
        bodyFr: `${S(d.template)} a compilé ${S(d.count, '999')} nouvel(x) élément(s) dans un brouillon. Ouvrez la page des modèles pour relire et publier.`,
      };
    case 'poll.closed':
      return {
        title: 'A community poll has closed',
        titleFr: 'Un sondage communautaire est clos',
        body: `${S(d.question)} — ${S(d.count, '999')} votes recorded. Review the results in the polls panel.`,
        bodyFr: `${S(d.question)} — ${S(d.count, '999')} vote(s) enregistré(s). Consultez les résultats dans le panneau des sondages.`,
      };
    case 'credential.hygiene':
      return {
        title: 'Credential hygiene needs attention',
        titleFr: 'Hygiène des identifiants à vérifier',
        body: `${S(d.expired)} expired · ${S(d.due)} rotation-due · ${S(d.expiring)} expiring soon (${S(d.names)}). Open Credentials to rotate.`,
        bodyFr: `${S(d.expired)} expiré(s) · ${S(d.due)} à renouveler · ${S(d.expiring)} bientôt expirés (${S(d.names)}). Ouvrez les identifiants pour la rotation.`,
      };
    case 'storage.hygiene':
      return {
        title: 'Storage tasks need attention',
        titleFr: 'Tâches de stockage à vérifier',
        body: `${S(d.failed)} failed storage task(s)${d.pending ? ` · ${S(d.pending)} still pending` : ''}${d.quota ? ` · storage at ${S(d.quota)} of quota` : ''}. Open Storage & backup to retry.`,
        bodyFr: `${S(d.failed)} tâche(s) de stockage en échec${d.pending ? ` · ${S(d.pending)} encore en attente` : ''}${d.quota ? ` · stockage à ${S(d.quota)} du quota` : ''}. Ouvrez Stockage & sauvegarde pour réessayer.`,
      };
    case 'security.critical':
      return {
        title: 'Critical mode activated',
        titleFr: 'Mode critique activé',
        body: `${S(d.title)} — the platform is in CRITICAL state. Open the incident console.`,
        bodyFr: `${S(d.title)} — la plateforme est en état CRITIQUE. Ouvrez la console d’incident.`,
      };
    case 'system.degraded':
      return {
        title: 'Platform health degraded',
        titleFr: 'Santé de la plateforme dégradée',
        body: `Telemetry tripped DEGRADED (${S(d.detail)}). Open Platform states to confirm or clear.`,
        bodyFr: `La télémétrie a déclenché l’état DÉGRADÉ (${S(d.detail)}). Ouvrez les états de la plateforme pour confirmer ou effacer.`,
      };
  }
}

/** Staff deep-link defaults per event (admin paths, locale-prefixed at render). */
export function defaultStaffPath(event: NotifyEvent): string {
  switch (event) {
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
    case 'correction.resolved':
      return '/admin/trust-safety';
    case 'plan.failed':
      return '/admin/automations';
    case 'digest.ready_for_review':
      return '/admin/templates';
    case 'poll.closed':
      return '/admin/polls';
    case 'credential.hygiene':
      return '/admin/secrets';
    case 'storage.hygiene':
      return '/admin/storage-backup';
    case 'security.critical':
      return '/admin/incidents';
    case 'system.degraded':
      return '/admin/states';
    case 'content.updated':
      return '/admin/trust-safety';
    case 'translation.gap':
      return '/admin/translations';
    case 'content.milestone':
      return '/admin/fundraisers';
    default:
      return '/admin/dashboard';
  }
}
