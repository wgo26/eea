-- About / legal seed (2026-09-04): first current EN+FR versions for the
-- five /about/* pages. Editors manage later versions from /admin/policies;
-- readers fall back to English when a locale row is missing, so both locales
-- ship here (sitemap §17: legal text must not be English-only).

-- Retire any previous current rows for these types so exactly one row per
-- (policy_type, locale) stays current.
update public.policy_versions
set is_current = false
where policy_type in ('terms', 'privacy', 'guidelines', 'copyright', 'contact')
  and is_current = true;

-- ---------------------------------------------------------------- terms/en
insert into public.policy_versions (policy_type, version, locale, content, is_current)
values ('terms', '2026-09-04-v1', 'en', $$## Terms of Service

**Effective 4 September 2026.** Eagle Eye Africa ("we") runs a community media platform: photo stories, community news, notices, classifieds and culture, submitted by the community and verified before publication.

## Using the platform

- You must be at least 13 years old to submit content.
- You keep ownership of what you submit. By submitting, you grant us a non-exclusive, worldwide licence to publish, distribute and archive it with your contributor credit.
- Only submit what you photographed, wrote, or have permission to share. Do not submit other people's private information.

## Acceptable use

1. No spam, scams, hate speech, or incitement to violence.
2. No misinformation presented as fact — developing stories are labelled as such.
3. No listings for illegal goods, and no impersonation of officials or organisations.

## Moderation

Editors may edit headlines and descriptions for clarity, re-categorise, feature, schedule, approve, reject with a reason, or archive content. Rejected submitters are told why where possible.

## Accounts and roles

Admins, editors, contributors and advertisers have different permissions. An authenticated user with no role is a member: they can manage their own submissions and account but cannot moderate.

## Liability

Community submissions reflect their authors until verified. Verified, official-source and developing labels show our confidence level. Nothing here is legal advice.

Questions: see [Contact](/about/contact).$$, true)
on conflict (policy_type, locale, version) do update
set content = excluded.content, is_current = true;

-- ---------------------------------------------------------------- terms/fr
insert into public.policy_versions (policy_type, version, locale, content, is_current)
values ('terms', '2026-09-04-v1', 'fr', $$## Conditions d'utilisation

**En vigueur au 4 septembre 2026.** Eagle Eye Africa (« nous ») exploite une plateforme médiatique communautaire : reportages photo, actualités communautaires, avis, petites annonces et culture, soumis par la communauté et vérifiés avant publication.

## Utilisation de la plateforme

- Vous devez avoir au moins 13 ans pour soumettre un contenu.
- Vous restez propriétaire de ce que vous soumettez. En soumettant, vous nous accordez une licence mondiale non exclusive pour le publier, le diffuser et l'archiver avec votre crédit de contributeur.
- Ne soumettez que ce que vous avez photographié, écrit, ou que vous avez le droit de partager. Ne publiez pas les informations privées d'autrui.

## Usages acceptables

1. Pas de spam, d'arnaques, de discours de haine ni d'incitation à la violence.
2. Pas de désinformation présentée comme un fait — les histoires en cours sont signalées comme telles.
3. Pas d'annonces pour des biens illégaux, ni d'usurpation de fonctionnaires ou d'organisations.

## Modération

Les éditeurs peuvent corriger titres et descriptions, recatégoriser, mettre en avant, programmer, approuver, rejeter avec un motif, ou archiver. Les auteurs rejetés sont informés du motif lorsque c'est possible.

## Comptes et rôles

Admins, éditeurs, contributeurs et annonceurs ont des permissions différentes. Un utilisateur connecté sans rôle est un membre : il gère ses soumissions et son compte mais ne modère pas.

## Responsabilité

Les soumissions reflètent leurs auteurs jusqu'à vérification. Les mentions vérifié, source officielle et en cours indiquent notre niveau de confiance. Rien ici n'est un conseil juridique.

Questions : voir [Contact](/about/contact).$$, true)
on conflict (policy_type, locale, version) do update
set content = excluded.content, is_current = true;

-- -------------------------------------------------------------- privacy/en
insert into public.policy_versions (policy_type, version, locale, content, is_current)
values ('privacy', '2026-09-04-v1', 'en', $$## Privacy Policy

**Effective 4 September 2026.** We collect as little as possible to run a verified community record.

## What we collect

- **Submissions:** your name, contact (email or phone), and the content you send. Contact details stay private; only your contributor name is published.
- **Accounts:** email, profile details you provide, and role assignments.
- **Technical:** one consent-preference flag in your browser, plus the cookies Supabase authentication needs to keep you signed in. No advertising trackers.

## What we never do

- We never sell personal data, never publish contributor phone numbers or emails, and never use your content to train models without consent.

## Retention

- Published stories stay archived as the community record.
- Submissions data is kept while needed for moderation and corrections.
- You may request access, correction or deletion at any time — see the form below. We reply within 30 days.

## Your rights

Request a copy, correction or deletion of your data below, or write via [Contact](/about/contact). Account deletion removes your profile; published stories keep their byline unless a takedown applies — see [Copyright & Takedown](/about/copyright).$$, true)
on conflict (policy_type, locale, version) do update
set content = excluded.content, is_current = true;

-- -------------------------------------------------------------- privacy/fr
insert into public.policy_versions (policy_type, version, locale, content, is_current)
values ('privacy', '2026-09-04-v1', 'fr', $$## Politique de confidentialité

**En vigueur au 4 septembre 2026.** Nous collectons le minimum nécessaire pour tenir un enregistrement communautaire vérifié.

## Ce que nous collectons

- **Soumissions :** votre nom, un contact (e-mail ou téléphone) et le contenu envoyé. Les coordonnées restent privées ; seul votre nom de contributeur est publié.
- **Comptes :** e-mail, détails de profil fournis, et attributions de rôles.
- **Technique :** un seul indicateur de préférence dans votre navigateur, plus les cookies nécessaires à l'authentification Supabase. Aucun traqueur publicitaire.

## Ce que nous ne faisons jamais

- Nous ne vendons jamais de données personnelles, ne publions jamais les téléphones ou e-mails des contributeurs, et n'utilisons jamais vos contenus pour entraîner des modèles sans consentement.

## Conservation

- Les histoires publiées restent archivées comme mémoire communautaire.
- Les données de soumission sont conservées le temps de la modération et des corrections.
- Vous pouvez demander accès, correction ou suppression à tout moment — voir le formulaire ci-dessous. Réponse sous 30 jours.

## Vos droits

Demandez une copie, une correction ou une suppression ci-dessous, ou écrivez via [Contact](/about/contact). La suppression du compte retire votre profil ; les histoires publiées gardent leur signature sauf retrait applicable — voir [Droit d'auteur & retrait](/about/copyright).$$, true)
on conflict (policy_type, locale, version) do update
set content = excluded.content, is_current = true;

-- ----------------------------------------------------------- guidelines/en
insert into public.policy_versions (policy_type, version, locale, content, is_current)
values ('guidelines', '2026-09-04-v1', 'en', $$## Community Guidelines

Our promise: **seen by the community, verified by Eagle Eye.** These rules keep the record trustworthy.

## What belongs here

- First-hand sightings: what happened, where, when, what you saw.
- Photos you took, with honest captions, dates and locations.
- Notices that help neighbours: road closures, missing persons, school and church announcements.
- Honest classifieds with real prices and reachable sellers.

## What does not

1. Rumours stated as fact, edited or out-of-context media, or content you do not have the right to share.
2. Hate, harassment, graphic gore without public-interest justification, or sexual content involving minors — zero tolerance.
3. Scams, spam, or repeated low-effort submissions.

## Verification labels

- **Verified** — confirmed by our editors.
- **Official source** — published by an identified organisation.
- **Community submission** — sent by a member, not yet independently confirmed.
- **Developing** — still being verified.

## If you break the rules

We may edit, reject, or remove content and, for repeat abuse, restrict accounts. Serious cases (fraud, safety threats) are reported to the authorities. Appeals: reply to the rejection email or use [Contact](/about/contact).$$, true)
on conflict (policy_type, locale, version) do update
set content = excluded.content, is_current = true;

-- ----------------------------------------------------------- guidelines/fr
insert into public.policy_versions (policy_type, version, locale, content, is_current)
values ('guidelines', '2026-09-04-v1', 'fr', $$## Règles de la communauté

Notre promesse : **vu par la communauté, vérifié par Eagle Eye.** Ces règles gardent l'enregistrement digne de confiance.

## Ce qui a sa place ici

- Témoignages de première main : quoi, où, quand, ce que vous avez vu.
- Photos prises par vous, avec des légendes honnêtes, dates et lieux.
- Avis utiles aux voisins : routes fermées, personnes disparues, annonces d'écoles et d'églises.
- Petites annonces honnêtes avec de vrais prix et des vendeurs joignables.

## Ce qui n'y a pas sa place

1. Rumeurs présentées comme des faits, médias truqués ou hors contexte, ou contenus que vous n'avez pas le droit de partager.
2. Haine, harcèlement, gore gratuit sans intérêt public, ou contenu sexuel impliquant des mineurs — tolérance zéro.
3. Arnaques, spam, ou soumissions répétées sans effort.

## Mentions de vérification

- **Vérifié** — confirmé par nos éditeurs.
- **Source officielle** — publié par une organisation identifiée.
- **Soumission communautaire** — envoyée par un membre, pas encore confirmée indépendamment.
- **En cours** — encore en vérification.

## En cas de manquement

Nous pouvons modifier, rejeter ou retirer un contenu et, en cas d'abus répétés, restreindre des comptes. Les cas graves (fraude, menaces) sont signalés aux autorités. Recours : répondez à l'e-mail de rejet ou utilisez [Contact](/about/contact).$$, true)
on conflict (policy_type, locale, version) do update
set content = excluded.content, is_current = true;

-- ------------------------------------------------------------ copyright/en
insert into public.policy_versions (policy_type, version, locale, content, is_current)
values ('copyright', '2026-09-04-v1', 'en', $$## Copyright & Takedown

Photographs **are** the archive. We protect creators and act fast on disputes.

## Ownership

Contributors keep copyright. Eagle Eye Africa publishes under the licence granted in the [Terms](/about/terms), always with contributor credit (`Photo: [Name]`).

## If your work was used without permission

Use the takedown form below — not the generic report button. Tell us:

1. The link to the content on Eagle Eye Africa.
2. Proof you own it (original file, earlier publication, contract).
3. Where to reach you.

We acknowledge within 2 working days, investigate, and either remove the content, add correct credit, or explain why it stays. Repeat infringers lose submission rights.

## Counter-notices

If your content was removed and you believe that was wrong, reply with evidence of your right to publish. Malicious false claims may lead to account restriction.

Related: [Terms](/about/terms) · [Community Guidelines](/about/guidelines) · [Contact](/about/contact).$$, true)
on conflict (policy_type, locale, version) do update
set content = excluded.content, is_current = true;

-- ------------------------------------------------------------ copyright/fr
insert into public.policy_versions (policy_type, version, locale, content, is_current)
values ('copyright', '2026-09-04-v1', 'fr', $$## Droit d'auteur & retrait

Les photographies **sont** l'archive. Nous protégeons les créateurs et agissons vite en cas de litige.

## Propriété

Les contributeurs gardent leur droit d'auteur. Eagle Eye Africa publie sous la licence accordée dans les [Conditions](/about/terms), toujours avec crédit (`Photo : [Nom]`).

## Si votre œuvre a été utilisée sans autorisation

Utilisez le formulaire de retrait ci-dessous — pas le bouton de signalement générique. Indiquez :

1. Le lien du contenu sur Eagle Eye Africa.
2. La preuve de propriété (fichier original, publication antérieure, contrat).
3. Où vous joindre.

Accusé sous 2 jours ouvrés, enquête, puis retrait, crédit corrigé, ou explication du maintien. Les récidivistes perdent le droit de soumettre.

## Contestations

Si votre contenu a été retiré à tort, répondez avec la preuve de votre droit de publier. Les fausses déclarations malveillantes peuvent entraîner une restriction de compte.

Liens : [Conditions](/about/terms) · [Règles](/about/guidelines) · [Contact](/about/contact).$$, true)
on conflict (policy_type, locale, version) do update
set content = excluded.content, is_current = true;

-- -------------------------------------------------------------- contact/en
insert into public.policy_versions (policy_type, version, locale, content, is_current)
values ('contact', '2026-09-04-v1', 'en', $$### Editorial desk

Tips, corrections and partnership inquiries go through the form below. For copyright disputes use [Copyright & Takedown](/about/copyright); for data requests see [Privacy](/about/privacy).

We reply within **two working days**. Urgent safety matter? Put "URGENT" at the start of your message.$$ , true)
on conflict (policy_type, locale, version) do update
set content = excluded.content, is_current = true;

-- -------------------------------------------------------------- contact/fr
insert into public.policy_versions (policy_type, version, locale, content, is_current)
values ('contact', '2026-09-04-v1', 'fr', $$### Bureau éditorial

Infos, corrections et partenariats passent par le formulaire ci-dessous. Pour les litiges de droit d'auteur, voir [Droit d'auteur & retrait](/about/copyright) ; pour les données, voir [Confidentialité](/about/privacy).

Réponse sous **deux jours ouvrés**. Urgence de sécurité ? Commencez votre message par « URGENT ». $$, true)
on conflict (policy_type, locale, version) do update
set content = excluded.content, is_current = true;
