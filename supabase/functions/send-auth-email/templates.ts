interface TemplateData {
  email: string;
  confirmation_url?: string;
  new_email?: string;
  site_url: string;
}

interface RenderedTemplate {
  subject: string;
  html: string;
}

const BRAND = {
  name: "Eagle Eye Africa",
  tagline: "Seen by the community. Verified by Eagle Eye.",
  primaryColor: "#E3A008",
  darkColor: "#16130A",
  lightBg: "#F6F4EE",
  cardBg: "#FFFFFF",
  borderColor: "#E7E1D3",
  textPrimary: "#1F1B12",
  textSecondary: "#4A4436",
  textMuted: "#6B6455",
  textFooter: "#CFC7B4",
  textFooterMuted: "#8A836F",
};

function wrapTemplate(locale: string, content: string, preheader: string): string {
  const dir = locale === "ar" || locale === "he" ? "rtl" : "ltr";
  const lang = locale === "fr" ? "fr" : "en";
  
  return `<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>${preheader}</title>
</head>
<body style="margin:0;padding:0;background-color:${BRAND.lightBg};font-family:Arial,Helvetica,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${BRAND.lightBg};padding:24px 12px;">
    <tr>
      <td align="center">
        ${content}
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function card(content: string): string {
  return `<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:${BRAND.cardBg};border-radius:12px;overflow:hidden;border:1px solid ${BRAND.borderColor};">
    ${content}
  </table>`;
}

function header(): string {
  return `<tr>
    <td style="background-color:${BRAND.darkColor};padding:28px 32px;text-align:center;">
      <p style="margin:0;color:${BRAND.primaryColor};font-size:13px;font-weight:bold;letter-spacing:3px;">&#9673; ${BRAND.name}</p>
      <p style="margin:8px 0 0;color:${BRAND.textFooter};font-size:12px;">${BRAND.tagline}</p>
    </td>
  </tr>`;
}

function footer(): string {
  return `<tr>
    <td style="background-color:${BRAND.darkColor};padding:20px 32px;text-align:center;">
      <p style="margin:0 0 6px;font-size:12px;color:${BRAND.textFooter};">&copy; ${BRAND.name} &middot; eagleeyeafrica.org</p>
      <p style="margin:0;font-size:11px;color:${BRAND.textFooterMuted};">Never share your password with anyone — our team will never ask for it.</p>
    </td>
  </tr>`;
}

function button(url: string, text: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
    <tr>
      <td align="center" style="background-color:${BRAND.primaryColor};border-radius:8px;">
        <a href="${url}" style="display:inline-block;padding:14px 36px;color:${BRAND.darkColor};font-size:15px;font-weight:bold;text-decoration:none;">${text}</a>
      </td>
    </tr>
  </table>`;
}

function fallbackLink(url: string): string {
  return `<p style="margin:0 0 24px;font-size:12px;line-height:1.6;color:${BRAND.textMuted};word-break:break-all;">
    Button not working? Paste this link into your browser:<br />
    <a href="${url}" style="color:#9A6B00;">${url}</a>
  </p>`;
}

function hr(): string {
  return `<hr style="border:none;border-top:1px solid ${BRAND.borderColor};margin:0 0 24px;" />`;
}

const TEMPLATES: Record<string, Record<string, (data: TemplateData) => RenderedTemplate>> = {
  confirmation: {
    en: (data) => ({
      subject: `Confirm your ${BRAND.name} account`,
      html: wrapTemplate("en", card(
        header() +
        `<tr>
          <td style="padding:32px;">
            <h1 style="margin:0 0 8px;font-size:22px;color:${BRAND.textPrimary};">Confirm your account</h1>
            <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:${BRAND.textSecondary};">
              Hi there — you signed up for <strong>${BRAND.name}</strong> with ${data.email}.
              Click the button below to confirm your email address and activate your account.
            </p>
            ${button(data.confirmation_url!, "Confirm my account")}
            ${fallbackLink(data.confirmation_url!)}
            <p style="margin:0 0 24px;font-size:12px;line-height:1.6;color:${BRAND.textMuted};">This link expires in 1 hour. If you didn't create this account, you can safely ignore this email.</p>
          </td>
        </tr>` +
        footer()
      ), `Confirm your ${BRAND.name} account`),
    }),
    fr: (data) => ({
      subject: `Confirmez votre compte ${BRAND.name}`,
      html: wrapTemplate("fr", card(
        header() +
        `<tr>
          <td style="padding:32px;">
            <h1 style="margin:0 0 8px;font-size:22px;color:${BRAND.textPrimary};">Confirmez votre compte</h1>
            <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:${BRAND.textSecondary};">
              Bonjour — vous vous &ecirc;tes inscrit&middot;e sur <strong>${BRAND.name}</strong> avec ${data.email}.
              Cliquez sur le bouton ci-dessous pour confirmer votre adresse e-mail et activer votre compte.
            </p>
            ${button(data.confirmation_url!, "Confirmer mon compte")}
            ${fallbackLink(data.confirmation_url!)}
            <p style="margin:0 0 24px;font-size:12px;line-height:1.6;color:${BRAND.textMuted};">Ce lien expire dans 1 heure. Si vous n'&ecirc;tes pas &agrave; l'origine de cette inscription, ignorez cet e-mail.</p>
          </td>
        </tr>` +
        footer()
      ), `Confirmez votre compte ${BRAND.name}`),
    }),
  },

  recovery: {
    en: (data) => ({
      subject: `Reset your ${BRAND.name} password`,
      html: wrapTemplate("en", card(
        header() +
        `<tr>
          <td style="padding:32px;">
            <h1 style="margin:0 0 8px;font-size:22px;color:${BRAND.textPrimary};">Reset your password</h1>
            <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:${BRAND.textSecondary};">
              We received a password reset request for <strong>${data.email}</strong>.
              Click below to choose a new password.
            </p>
            ${button(data.confirmation_url!, "Reset my password")}
            ${fallbackLink(data.confirmation_url!)}
            <p style="margin:0 0 24px;font-size:12px;line-height:1.6;color:${BRAND.textMuted};">This link expires in 1 hour. If you didn't request a reset, you can safely ignore this email — your password won't change.</p>
          </td>
        </tr>` +
        footer()
      ), `Reset your ${BRAND.name} password`),
    }),
    fr: (data) => ({
      subject: `R&eacute;initialisez votre mot de passe ${BRAND.name}`,
      html: wrapTemplate("fr", card(
        header() +
        `<tr>
          <td style="padding:32px;">
            <h1 style="margin:0 0 8px;font-size:22px;color:${BRAND.textPrimary};">R&eacute;initialisez votre mot de passe</h1>
            <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:${BRAND.textSecondary};">
              Nous avons re&ccedil;u une demande de r&eacute;initialisation pour <strong>${data.email}</strong>.
              Cliquez ci-dessous pour choisir un nouveau mot de passe.
            </p>
            ${button(data.confirmation_url!, "R&eacute;initialiser mon mot de passe")}
            ${fallbackLink(data.confirmation_url!)}
            <p style="margin:0 0 24px;font-size:12px;line-height:1.6;color:${BRAND.textMuted};">Ce lien expire dans 1 heure. Si vous n'avez rien demand&eacute;, ignorez cet e-mail — votre mot de passe restera inchang&eacute;.</p>
          </td>
        </tr>` +
        footer()
      ), `R&eacute;initialisez votre mot de passe ${BRAND.name}`),
    }),
  },

  magic_link: {
    en: (data) => ({
      subject: `Your ${BRAND.name} sign-in link`,
      html: wrapTemplate("en", card(
        header() +
        `<tr>
          <td style="padding:32px;">
            <h1 style="margin:0 0 8px;font-size:22px;color:${BRAND.textPrimary};">Your sign-in link</h1>
            <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:${BRAND.textSecondary};">
              Click below to sign in to <strong>${BRAND.name}</strong> as ${data.email}.
              No password needed.
            </p>
            ${button(data.confirmation_url!, "Sign me in")}
            ${fallbackLink(data.confirmation_url!)}
            <p style="margin:0 0 24px;font-size:12px;line-height:1.6;color:${BRAND.textMuted};">This link expires in 1 hour. If you didn't request it, you can safely ignore this email.</p>
          </td>
        </tr>` +
        footer()
      ), `Your ${BRAND.name} sign-in link`),
    }),
    fr: (data) => ({
      subject: `Votre lien de connexion ${BRAND.name}`,
      html: wrapTemplate("fr", card(
        header() +
        `<tr>
          <td style="padding:32px;">
            <h1 style="margin:0 0 8px;font-size:22px;color:${BRAND.textPrimary};">Votre lien de connexion</h1>
            <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:${BRAND.textSecondary};">
              Cliquez ci-dessous pour vous connecter &agrave; <strong>${BRAND.name}</strong> en tant que ${data.email}.
            </p>
            ${button(data.confirmation_url!, "Me connecter")}
            ${fallbackLink(data.confirmation_url!)}
            <p style="margin:0 0 24px;font-size:12px;line-height:1.6;color:${BRAND.textMuted};">Ce lien expire dans 1 heure. Si vous ne l'avez pas demand&eacute;, ignorez cet e-mail.</p>
          </td>
        </tr>` +
        footer()
      ), `Votre lien de connexion ${BRAND.name}`),
    }),
  },

  invite: {
    en: (data) => ({
      subject: `You've been invited to ${BRAND.name}`,
      html: wrapTemplate("en", card(
        header() +
        `<tr>
          <td style="padding:32px;">
            <h1 style="margin:0 0 8px;font-size:22px;color:${BRAND.textPrimary};">You've been invited</h1>
            <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:${BRAND.textSecondary};">
              You've been invited to join <strong>${BRAND.name}</strong> — the community-powered
              platform for local news, photo stories, notices, buy & sell and culture.
              Accept the invitation to create your account.
            </p>
            ${button(data.confirmation_url!, "Accept invitation")}
            ${fallbackLink(data.confirmation_url!)}
          </td>
        </tr>` +
        footer()
      ), `You've been invited to ${BRAND.name}`),
    }),
    fr: (data) => ({
      subject: `Invitation &agrave; rejoindre ${BRAND.name}`,
      html: wrapTemplate("fr", card(
        header() +
        `<tr>
          <td style="padding:32px;">
            <h1 style="margin:0 0 8px;font-size:22px;color:${BRAND.textPrimary};">Vous &ecirc;tes invit&eacute;&middot;e</h1>
            <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:${BRAND.textSecondary};">
              Vous avez &eacute;t&eacute; invit&eacute;&middot;e &agrave; rejoindre <strong>${BRAND.name}</strong>.
              Acceptez l'invitation pour cr&eacute;er votre compte.
            </p>
            ${button(data.confirmation_url!, "Accepter l'invitation")}
            ${fallbackLink(data.confirmation_url!)}
          </td>
        </tr>` +
        footer()
      ), `Invitation &agrave; rejoindre ${BRAND.name}`),
    }),
  },

  email_change: {
    en: (data) => ({
      subject: `Confirm your new ${BRAND.name} email`,
      html: wrapTemplate("en", card(
        header() +
        `<tr>
          <td style="padding:32px;">
            <h1 style="margin:0 0 8px;font-size:22px;color:${BRAND.textPrimary};">Confirm your new email</h1>
            <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:${BRAND.textSecondary};">
              You asked to change the email on your <strong>${BRAND.name}</strong> account
              from ${data.email} to <strong>${data.new_email}</strong>.
              Click below to confirm the change.
            </p>
            ${button(data.confirmation_url!, "Confirm new email")}
            ${fallbackLink(data.confirmation_url!)}
            <p style="margin:0 0 24px;font-size:12px;line-height:1.6;color:${BRAND.textMuted};">If you didn&apos;t request this change, please secure your account and contact us right away.</p>
          </td>
        </tr>` +
        footer()
      ), `Confirm your new ${BRAND.name} email`),
    }),
    fr: (data) => ({
      subject: `Confirmez votre nouvel e-mail ${BRAND.name}`,
      html: wrapTemplate("fr", card(
        header() +
        `<tr>
          <td style="padding:32px;">
            <h1 style="margin:0 0 8px;font-size:22px;color:${BRAND.textPrimary};">Confirmez votre nouvel e-mail</h1>
            <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:${BRAND.textSecondary};">
              Vous avez demand&eacute; &agrave; remplacer l'adresse de votre compte <strong>${BRAND.name}</strong>
              (${data.email}) par <strong>${data.new_email}</strong>.
              Cliquez ci-dessous pour confirmer.
            </p>
            ${button(data.confirmation_url!, "Confirmer le nouvel e-mail")}
            ${fallbackLink(data.confirmation_url!)}
            <p style="margin:0 0 24px;font-size:12px;line-height:1.6;color:${BRAND.textMuted};">Si vous n'avez rien demand&eacute;, s&eacute;curisez votre compte et contactez-nous.</p>
          </td>
        </tr>` +
        footer()
      ), `Confirmez votre nouvel e-mail ${BRAND.name}`),
    }),
  },

  password_changed: {
    en: (data) => ({
      subject: `Your ${BRAND.name} password was changed`,
      html: wrapTemplate("en", card(
        header() +
        `<tr>
          <td style="padding:32px;">
            <h1 style="margin:0 0 8px;font-size:22px;color:${BRAND.textPrimary};">Your password was changed</h1>
            <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:${BRAND.textSecondary};">
              This is a security notice for <strong>${data.email}</strong>: the password on your
              <strong>${BRAND.name}</strong> account was just changed.
            </p>
            <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:${BRAND.textSecondary};">
              If this was you, no further action is needed. If it wasn't you, reset your
              password immediately and contact us — someone else may have access to your account.
            </p>
          </td>
        </tr>` +
        footer()
      ), `Your ${BRAND.name} password was changed`),
    }),
    fr: (data) => ({
      subject: `Votre mot de passe ${BRAND.name} a &eacute;t&eacute; modifi&eacute;`,
      html: wrapTemplate("fr", card(
        header() +
        `<tr>
          <td style="padding:32px;">
            <h1 style="margin:0 0 8px;font-size:22px;color:${BRAND.textPrimary};">Votre mot de passe a &eacute;t&eacute; modifi&eacute;</h1>
            <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:${BRAND.textSecondary};">
              Ceci est un avis de s&eacute;curit&eacute; pour <strong>${data.email}</strong> : le mot de passe
              de votre compte <strong>${BRAND.name}</strong> vient d'&ecirc;tre modifi&eacute;.
            </p>
            <p style="margin:0;font-size:14px;line-height:1.6;color:${BRAND.textSecondary};">
              Si c'est bien vous, ignorez cet e-mail. Sinon, r&eacute;initialisez votre mot de passe
              imm&eacute;diatement et contactez-nous.
            </p>
          </td>
        </tr>` +
        footer()
      ), `Votre mot de passe ${BRAND.name} a &eacute;t&eacute; modifi&eacute;`),
    }),
  },
};

export function renderTemplate(
  type: string,
  locale: string,
  data: TemplateData
): RenderedTemplate {
  const templates = TEMPLATES[type];
  if (!templates) {
    throw new Error(`Unknown email type: ${type}`);
  }

  const template = templates[locale] || templates.en;
  if (!template) {
    throw new Error(`No template for type ${type} locale ${locale}`);
  }

  return template(data);
}