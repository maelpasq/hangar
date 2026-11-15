// Connexion : Better Auth (code par e-mail, Discord, Google), tables dans Turso via Drizzle.
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { emailOTP } from 'better-auth/plugins/email-otp';
import type { Db, Env, Mailer, Notice } from './env';
import { NOTICE_SUBJECT, mailHtml, mailSubject, mailText, noticeHtml, noticeText } from './mail';
import * as schema from './schema';

export type Provider = 'discord' | 'google';

/** Services de connexion configurés (ceux dont les identifiants sont dans les secrets). */
export function providers(env: Env): Provider[] {
  const out: Provider[] = [];
  if (env.DISCORD_CLIENT_ID && env.DISCORD_CLIENT_SECRET) out.push('discord');
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) out.push('google');
  return out;
}

/** Envoi par Resend. Sans clé (développement local), le code est écrit dans le journal. */
export function resendMailer(env: Env): Mailer {
  return async (to, code) => {
    if (!env.RESEND_API_KEY || !env.MAIL_FROM) {
      console.log(`[hangar] code de connexion pour ${to} : ${code}`);
      return;
    }
    await send(env, to, mailSubject(code), mailText(code), mailHtml(code, env.BASE_URL));
  };
}

/** Rappel avant la suppression d'un compte inactif. Sans clé (développement local) : journal. */
export function noticeMailer(env: Env): Notice {
  return async (to) => {
    if (!env.RESEND_API_KEY || !env.MAIL_FROM) {
      console.log(`[hangar] rappel de compte inactif pour ${to}`);
      return;
    }
    await send(env, to, NOTICE_SUBJECT, noticeText(), noticeHtml(env.BASE_URL));
  };
}

async function send(env: Env, to: string, subject: string, text: string, html: string): Promise<void> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: env.MAIL_FROM, to: [to], subject, text, html })
  });
  if (!res.ok) throw new Error(`Envoi de l'e-mail refusé (${res.status})`);
}

export function createAuth(db: Db, env: Env, sendMail: Mailer) {
  const social: Record<string, { clientId: string; clientSecret: string }> = {};
  if (env.DISCORD_CLIENT_ID && env.DISCORD_CLIENT_SECRET) {
    social.discord = { clientId: env.DISCORD_CLIENT_ID, clientSecret: env.DISCORD_CLIENT_SECRET };
  }
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    social.google = { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET };
  }
  return betterAuth({
    baseURL: env.BASE_URL,
    basePath: '/auth',
    secret: env.AUTH_SECRET,
    database: drizzleAdapter(db, { provider: 'sqlite', schema }),
    socialProviders: social,
    // La session du navigateur ne sert qu'à rendre un code à l'app : elle est courte.
    session: { expiresIn: 60 * 15, updateAge: 60 * 15 },
    rateLimit: { enabled: true, storage: 'database', window: 60, max: 30 },
    // Derrière Cloudflare, l'adresse du visiteur est dans cet en-tête (limite de débit par adresse).
    advanced: { ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] } },
    telemetry: { enabled: false },
    plugins: [
      emailOTP({
        otpLength: 6,
        expiresIn: 600,
        allowedAttempts: 5,
        storeOTP: 'hashed',
        sendVerificationOTP: async ({ email, otp, type }) => {
          if (type === 'sign-in') await sendMail(email, otp);
        }
      })
    ]
  });
}

export type Auth = ReturnType<typeof createAuth>;
