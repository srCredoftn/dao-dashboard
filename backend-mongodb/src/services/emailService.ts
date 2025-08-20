import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
}

interface SendEmailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

class EmailService {
  private transporter: nodemailer.Transporter | null = null;
  private isConfigured = false;

  constructor() {
    this.initializeTransporter();
  }

  private initializeTransporter() {
    const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;

    // Check if email is configured
    if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
      console.log("⚠️  Email service not configured - missing SMTP credentials");
      console.log("📧 Password reset codes will be logged to console instead");
      return;
    }

    const config: EmailConfig = {
      host: SMTP_HOST,
      port: parseInt(SMTP_PORT),
      secure: parseInt(SMTP_PORT) === 465, // true for 465, false for other ports
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
    };

    this.transporter = nodemailer.createTransporter(config);
    this.isConfigured = true;

    // Verify connection configuration
    this.transporter.verify((error, success) => {
      if (error) {
        console.error("❌ Email service configuration failed:", error.message);
        this.isConfigured = false;
      } else {
        console.log("✅ Email service ready to send messages");
      }
    });
  }

  async sendEmail(options: SendEmailOptions): Promise<boolean> {
    if (!this.isConfigured || !this.transporter) {
      console.log(`📧 Email would be sent to: ${options.to}`);
      console.log(`📧 Subject: ${options.subject}`);
      if (options.text) {
        console.log(`📧 Content: ${options.text}`);
      }
      return false;
    }

    try {
      const mailOptions = {
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
      };

      const info = await this.transporter.sendMail(mailOptions);
      console.log(`✅ Email sent successfully to ${options.to}: ${info.messageId}`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to send email to ${options.to}:`, error);
      return false;
    }
  }

  async sendPasswordResetEmail(email: string, resetCode: string): Promise<boolean> {
    const subject = "Réinitialisation de votre mot de passe - 2SND";
    
    const text = `
Bonjour,

Vous avez demandé la réinitialisation de votre mot de passe.

Code de réinitialisation: ${resetCode}

Ce code est valide pendant 15 minutes.

Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.

Cordialement,
L'équipe 2SND
    `;

    const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px;">
        <h2 style="color: #333; text-align: center;">Réinitialisation de mot de passe</h2>
        
        <div style="background-color: white; padding: 20px; border-radius: 6px; margin: 20px 0;">
          <p>Bonjour,</p>
          
          <p>Vous avez demandé la réinitialisation de votre mot de passe pour votre compte 2SND.</p>
          
          <div style="background-color: #0055ff; color: white; padding: 15px; border-radius: 4px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 4px; margin: 20px 0;">
            ${resetCode}
          </div>
          
          <p style="color: #666; font-size: 14px;">
            Ce code est valide pendant <strong>15 minutes</strong>.
          </p>
          
          <p style="color: #666; font-size: 14px;">
            Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.
          </p>
        </div>
        
        <p style="text-align: center; color: #888; font-size: 12px;">
          Cordialement,<br>
          L'équipe 2SND Technologies
        </p>
      </div>
    </div>
    `;

    console.log(`📧 Sending password reset email to: ${email} with code: ${resetCode}`);
    
    const sent = await this.sendEmail({
      to: email,
      subject,
      text,
      html,
    });

    // Always log the code for development purposes
    if (!sent) {
      console.log(`📧 Password reset code for ${email}: ${resetCode}`);
    }

    return sent;
  }

  isEmailConfigured(): boolean {
    return this.isConfigured;
  }
}

export const emailService = new EmailService();
export default EmailService;
