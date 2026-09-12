# WhatsApp utility templates — submission pack

Free-text Cloud API sends only work inside the 24h customer-service window
(the recipient messaged you last). Everything proactive — the 06:00 digest
fan-out, stale moderation alerts — needs an approved **utility** template.
This pack is the exact text to submit so approval passes first time and the
code (`lib/notify/channels.ts`) matches the approved shape.

## What to create (two templates)

| # | Name | Language | Category |
|---|---|---|---|
| 1 | `eea_alert_en` | English (`en`) | Utility |
| 2 | `eea_alert_fr` | French (`fr`) | Utility |

Rules both templates must follow (this is what the code sends):

- **Body only** — no header, no footer, no buttons. The API call carries a
  single body component with one text parameter; a template with buttons or
  a header will be rejected by the API at send time.
- **Exactly one parameter**, written `{{1}}`, carrying the alert text
  (title + body + link, truncated to 1000 chars by the worker).

### Template 1 — `eea_alert_en` (language `en`)

Body (copy verbatim, keep `{{1}}` intact):

```text
Eagle Eye Africa update: {{1}}

Reply STOP to opt out of WhatsApp alerts. Manage preferences in your account notifications page.
```

Sample value for `{{1}}` (Meta asks for one at submission):

```text
Your submission was published
Community well repair in Nkwen is now live on Eagle Eye Africa. Thank you for contributing!
https://eagleeyeafrica.org/en/news/community-well-repair-nkwen
```

### Template 2 — `eea_alert_fr` (language `fr`)

Body (copy verbatim, keep `{{1}}` intact):

```text
Actualité Eagle Eye Africa : {{1}}

Répondez STOP pour ne plus recevoir d’alertes WhatsApp. Gérez vos préférences dans la page des notifications de votre compte.
```

Sample value for `{{1}}`:

```text
Votre soumission a été publiée
La réparation du puits communautaire de Nkwen est en ligne sur Eagle Eye Africa. Merci pour votre contribution !
https://eagleeyeafrica.org/fr/news/community-well-repair-nkwen
```

## Why this wording passes review

- **Transactional, not marketing.** Utility covers account/submission/order
  updates. No greetings like "exciting news", no promotions, no
  superlatives — Meta reclassifies those as marketing and rejects them
  under utility.
- **Opt-out in the body.** Required for proactive sends; `STOP` handling is
  manual today (a reply opens the 24h window — staff see it in the
  inbox app, not here).
- **Full URLs only.** No shorteners (`bit.ly` et al. are a classic
  rejection trigger); the code always sends the canonical site URL.

## Submit (WhatsApp Manager)

1. Business Settings → WhatsApp Accounts → your number → **Message
   templates** → Create template.
2. Category **Utility**, language `en` then repeat for `fr`, body-only,
   paste the body above + the sample value, submit.
3. Approval is usually under an hour; rejected templates can be edited and
   resubmitted — the common fix is removing anything that reads like
   marketing.

## Wire it up

```bash
WHATSAPP_TEMPLATE=eea_alert_en
WHATSAPP_TEMPLATE_LANG=en
WHATSAPP_TEMPLATE_FR=eea_alert_fr
WHATSAPP_TEMPLATE_FR_LANG=fr
```

Then `npm run notify:env` (fails if the base `WHATSAPP_TOKEN` /
`WHATSAPP_PHONE_NUMBER_ID` pair is missing) and "Send test to me" in
`/admin/notifications` — the summary tells you what delivered. French
recipients automatically get the `_FR` twin; when it is unset they get the
base template language instead of failing.
