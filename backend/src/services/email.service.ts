import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { serverOrigin } from '../utils/response';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

let transporter: Transporter | null = null;

const getTransporter = (): Transporter | null => {
  if (env.EMAIL_CONFIG === 'disabled') return null;
  if (transporter) return transporter;

  if (env.EMAIL_CONFIG === 'smtp') {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS }
    });
  } else {
    // Console transport: the full message body is written to the server log in
    // development so a reset link is retrievable without a mail provider.
    transporter = nodemailer.createTransport({ jsonTransport: true });
  }
  return transporter;
};

export const isEmailConfigured = (): boolean => env.EMAIL_CONFIG !== 'disabled';

/**
 * Delivery is best effort: business flows must not fail because an SMTP server
 * is unreachable. In console mode the message body is logged in full.
 */
export const sendEmail = async (message: EmailMessage): Promise<{ delivered: boolean; logged: boolean }> => {
  const transport = getTransporter();
  if (!transport) {
    logger.info('Email skipped (EMAIL_CONFIG=disabled)', { to: message.to, subject: message.subject });
    return { delivered: false, logged: false };
  }

  if (env.EMAIL_CONFIG === 'console') {
    logger.info('Email (console transport)', {
      to: message.to,
      subject: message.subject,
      body: message.text
    });
    return { delivered: false, logged: true };
  }

  try {
    await transport.sendMail({
      from: env.EMAIL_FROM,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html
    });
    return { delivered: true, logged: false };
  } catch (error) {
    logger.error('Email delivery failed', { to: message.to, subject: message.subject, error });
    return { delivered: false, logged: false };
  }
};

export const sendPasswordResetEmail = async (email: string, name: string, token: string): Promise<void> => {
  const link = `${serverOrigin()}/reset-password?token=${encodeURIComponent(token)}`;
  await sendEmail({
    to: email,
    subject: 'Reset your Supply Medicals password',
    text: `Hello ${name},\n\nUse the link below to choose a new password. It expires in 60 minutes.\n${link}\n\nIf you did not request this, you can ignore this email.`
  });
};

export const sendAccountApprovedEmail = async (email: string, name: string): Promise<void> => {
  await sendEmail({
    to: email,
    subject: 'Your Supply Medicals account was approved',
    text: `Hello ${name},\n\nYour customer account has been approved. You can now sign in and place orders.`
  });
};

export const sendAccountRejectedEmail = async (email: string, name: string, reason?: string): Promise<void> => {
  await sendEmail({
    to: email,
    subject: 'Update on your Supply Medicals application',
    text: `Hello ${name},\n\nYour customer application was not approved at this time.${reason ? `\nReason: ${reason}` : ''}`
  });
};
