import { sendMail } from "../utils/mailer";

function buildResetEmailHtml(code: string) {
  return `
  <div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, sans-serif; line-height: 1.6; color: #111827;">
    <h2 style="margin: 0 0 12px;">Réinitialisation du mot de passe</h2>
    <p>Voici votre code de vérification&nbsp;:</p>
    <div style="display:inline-block; font-size: 22px; letter-spacing: 4px; font-weight: 700; background:#111827; color:#fff; padding: 10px 14px; border-radius: 8px;">${code}</div>
    <p style="margin-top:16px;">Ce code est valable 15 minutes. Ne le partagez avec personne.</p>
    <p style="font-size:12px;color:#6b7280;margin-top:24px;">Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer cet email.</p>
  </div>
  `;
}

export const EmailService = {
  async sendPasswordResetEmail(email: string, code: string) {
    const subject = "Réinitialisation du mot de passe";
    const text = `Code de vérification: ${code}\nValable 15 minutes.`;
    const html = buildResetEmailHtml(code);

    const result = await sendMail({ to: email, subject, text, html });
    return result;
  },
};
