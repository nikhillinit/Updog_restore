/**
 * Email Service - Abstraction Layer for Email Sending
 *
 * Provides a unified interface for sending emails.
 * Supports multiple backends: SMTP (nodemailer), SendGrid, or console (for testing).
 *
 * @module server/services/email-service
 */

import { EventEmitter } from 'events';
import { logger } from '../lib/logger';

// Email provider types
export type EmailProvider = 'console' | 'smtp' | 'sendgrid';

export interface EmailConfig {
  provider: EmailProvider;
  from: string;
  replyTo?: string;
  // SMTP config
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPass?: string;
  smtpSecure?: boolean;
  // SendGrid config
  sendgridApiKey?: string;
}

export interface EmailAddress {
  email: string;
  name?: string;
}

export interface EmailAttachment {
  filename: string;
  content: Buffer | string;
  contentType?: string;
}

export interface EmailMessage {
  to: EmailAddress | EmailAddress[];
  cc?: EmailAddress | EmailAddress[];
  bcc?: EmailAddress | EmailAddress[];
  subject: string;
  text?: string;
  html?: string;
  attachments?: EmailAttachment[];
  templateId?: string;
  templateData?: Record<string, unknown>;
  tags?: string[];
  metadata?: Record<string, string>;
}

export interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  timestamp: Date;
}

export interface EmailService {
  send(message: EmailMessage): Promise<SendResult>;
  sendBatch(messages: EmailMessage[]): Promise<SendResult[]>;
}

interface SMTPTransporter {
  sendMail(opts: unknown): Promise<{ messageId: string }>;
}

interface NodemailerModule {
  createTransport(options: {
    host?: string;
    port: number;
    secure: boolean;
    auth: {
      user?: string;
      pass?: string;
    };
  }): SMTPTransporter;
}

interface SendGridResponse {
  headers: { 'x-message-id': string };
}

interface SendGridClient {
  setApiKey(apiKey: string): void;
  send(message: unknown): Promise<[SendGridResponse]>;
}

interface SendGridModule {
  default: SendGridClient;
}

// Event emitter for email events (testing, monitoring)
class EmailEventEmitter extends EventEmitter {
  emitSent(message: EmailMessage, result: SendResult) {
    this.emit('sent', { message, result });
  }

  emitFailed(message: EmailMessage, error: string) {
    this.emit('failed', { message, error });
  }
}

export const emailEvents = new EmailEventEmitter();

// In-memory sent emails for testing
const sentEmails: Array<{ message: EmailMessage; result: SendResult }> = [];

/**
 * Console Email Service (for development/testing)
 * Logs emails to console instead of sending
 */
class ConsoleEmailService implements EmailService {
  private from: string;

  constructor(config: EmailConfig) {
    this.from = config.from;
  }

  async send(message: EmailMessage): Promise<SendResult> {
    const messageId = `console-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const timestamp = new Date();

    const toAddresses = Array.isArray(message.to) ? message.to : [message.to];

    logger.info(
      {
        provider: 'console',
        from: this.from,
        to: toAddresses.map((a) => ({ email: a.email, name: a.name ?? '' })),
        subject: message.subject,
        templateId: message.templateId ?? 'none',
        previewText: message.text
          ? `${message.text.slice(0, 200)}${message.text.length > 200 ? '...' : ''}`
          : undefined,
        attachments: message.attachments?.map((a) => a.filename),
      },
      '[email-service] Email captured by console provider'
    );

    const result: SendResult = {
      success: true,
      messageId,
      timestamp,
    };

    // Store for testing
    sentEmails.push({ message, result });
    emailEvents.emitSent(message, result);

    return result;
  }

  async sendBatch(messages: EmailMessage[]): Promise<SendResult[]> {
    return Promise.all(messages.map((m) => this.send(m)));
  }
}

/**
 * SMTP Email Service (requires nodemailer)
 */
class SMTPEmailService implements EmailService {
  private config: EmailConfig;
  private transporter: SMTPTransporter | null = null;

  constructor(config: EmailConfig) {
    this.config = config;
  }

  private async getTransporter(): Promise<SMTPTransporter> {
    if (this.transporter) return this.transporter;

    // Lazy import nodemailer (optional dependency)
    try {
      // @ts-expect-error - nodemailer is an optional dependency
      const nodemailer = (await import('nodemailer')) as unknown as NodemailerModule;
      const auth = {
        ...(this.config.smtpUser ? { user: this.config.smtpUser } : {}),
        ...(this.config.smtpPass ? { pass: this.config.smtpPass } : {}),
      };
      const transportConfig = {
        port: this.config.smtpPort || 587,
        secure: this.config.smtpSecure ?? false,
        auth,
        ...(this.config.smtpHost ? { host: this.config.smtpHost } : {}),
      };
      this.transporter = nodemailer.createTransport(transportConfig);
      return this.transporter;
    } catch {
      throw new Error('nodemailer not installed. Run: npm install nodemailer');
    }
  }

  async send(message: EmailMessage): Promise<SendResult> {
    const timestamp = new Date();

    try {
      const transporter = await this.getTransporter();

      const toAddresses = Array.isArray(message.to) ? message.to : [message.to];

      const mailOptions = {
        from: this.config.from,
        to: toAddresses.map((a) => (a.name ? `${a.name} <${a.email}>` : a.email)).join(', '),
        subject: message.subject,
        text: message.text,
        html: message.html,
        attachments: message.attachments?.map((a) => ({
          filename: a.filename,
          content: a.content,
          contentType: a.contentType,
        })),
      };

      const info = await transporter.sendMail(mailOptions);

      const result: SendResult = {
        success: true,
        messageId: info.messageId,
        timestamp,
      };

      emailEvents.emitSent(message, result);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      emailEvents.emitFailed(message, errorMessage);

      return {
        success: false,
        error: errorMessage,
        timestamp,
      };
    }
  }

  async sendBatch(messages: EmailMessage[]): Promise<SendResult[]> {
    return Promise.all(messages.map((m) => this.send(m)));
  }
}

/**
 * SendGrid Email Service (requires @sendgrid/mail)
 */
class SendGridEmailService implements EmailService {
  private config: EmailConfig;
  private sgMail: SendGridClient | null = null;

  constructor(config: EmailConfig) {
    this.config = config;
  }

  private async getClient(): Promise<SendGridClient> {
    if (this.sgMail) return this.sgMail;

    // Lazy import SendGrid (optional dependency)
    try {
      // @ts-expect-error - @sendgrid/mail is an optional dependency
      const sendGridModule = (await import('@sendgrid/mail')) as unknown as SendGridModule;
      sendGridModule.default.setApiKey(this.config.sendgridApiKey || '');
      this.sgMail = sendGridModule.default;
      return this.sgMail;
    } catch {
      throw new Error('@sendgrid/mail not installed. Run: npm install @sendgrid/mail');
    }
  }

  async send(message: EmailMessage): Promise<SendResult> {
    const timestamp = new Date();

    try {
      const sgMail = await this.getClient();

      const toAddresses = Array.isArray(message.to) ? message.to : [message.to];

      const sgMessage = {
        from: this.config.from,
        to: toAddresses.map((a) => ({ email: a.email, name: a.name })),
        subject: message.subject,
        text: message.text,
        html: message.html,
        templateId: message.templateId,
        dynamicTemplateData: message.templateData,
        attachments: message.attachments?.map((a) => ({
          filename: a.filename,
          content: typeof a.content === 'string' ? a.content : a.content.toString('base64'),
          type: a.contentType,
          disposition: 'attachment',
        })),
      };

      const [response] = await sgMail.send(sgMessage);

      const result: SendResult = {
        success: true,
        messageId: response.headers['x-message-id'],
        timestamp,
      };

      emailEvents.emitSent(message, result);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      emailEvents.emitFailed(message, errorMessage);

      return {
        success: false,
        error: errorMessage,
        timestamp,
      };
    }
  }

  async sendBatch(messages: EmailMessage[]): Promise<SendResult[]> {
    return Promise.all(messages.map((m) => this.send(m)));
  }
}

// Default configuration from environment
const defaultConfig: EmailConfig = {
  provider: (process.env['EMAIL_PROVIDER'] as EmailProvider) || 'console',
  from: process.env['EMAIL_FROM'] || 'noreply@pressoncapital.com',
  smtpPort: parseInt(process.env['SMTP_PORT'] || '587', 10),
  smtpSecure: process.env['SMTP_SECURE'] === 'true',
  // Only set optional config if env vars are present
  ...(process.env['EMAIL_REPLY_TO'] ? { replyTo: process.env['EMAIL_REPLY_TO'] } : {}),
  ...(process.env['SMTP_HOST'] ? { smtpHost: process.env['SMTP_HOST'] } : {}),
  ...(process.env['SMTP_USER'] ? { smtpUser: process.env['SMTP_USER'] } : {}),
  ...(process.env['SMTP_PASS'] ? { smtpPass: process.env['SMTP_PASS'] } : {}),
  ...(process.env['SENDGRID_API_KEY'] ? { sendgridApiKey: process.env['SENDGRID_API_KEY'] } : {}),
};

/**
 * Create email service based on configuration
 */
export function createEmailService(config: EmailConfig = defaultConfig): EmailService {
  switch (config.provider) {
    case 'sendgrid':
      return new SendGridEmailService(config);
    case 'smtp':
      return new SMTPEmailService(config);
    case 'console':
    default:
      return new ConsoleEmailService(config);
  }
}

// Singleton instance
let emailInstance: EmailService | null = null;

/**
 * Get the email service singleton
 */
export function getEmailService(): EmailService {
  if (!emailInstance) {
    emailInstance = createEmailService();
  }
  return emailInstance;
}

/**
 * Reset email service (for testing)
 */
export function resetEmailService(): void {
  emailInstance = null;
  sentEmails.length = 0;
}

/**
 * Get sent emails (for testing)
 */
export function getSentEmails(): Array<{ message: EmailMessage; result: SendResult }> {
  return [...sentEmails];
}

/**
 * Clear sent emails (for testing)
 */
export function clearSentEmails(): void {
  sentEmails.length = 0;
}

// Export default instance
export const email = getEmailService();

// ============================================================================
// EMAIL TEMPLATES
// ============================================================================

export interface CapitalCallEmailData {
  lpName: string;
  fundName: string;
  callAmount: number;
  callDate: Date;
  dueDate: Date;
  purpose: string;
  wireInstructions: {
    bankName: string;
    accountName: string;
    accountNumber: string;
    routingNumber: string;
    reference: string;
  };
}

export interface DistributionEmailData {
  lpName: string;
  fundName: string;
  distributionAmount: number;
  distributionDate: Date;
  distributionType: 'return_of_capital' | 'income' | 'capital_gains';
  breakdown?: {
    returnOfCapital?: number;
    income?: number;
    capitalGains?: number;
  };
}

export interface ReportReadyEmailData {
  lpName: string;
  reportType: string;
  reportPeriod: string;
  downloadUrl: string;
  expiresAt: Date;
}

/**
 * Send capital call notification email
 */
export async function sendCapitalCallEmail(
  to: EmailAddress,
  data: CapitalCallEmailData
): Promise<SendResult> {
  const service = getEmailService();

  const formattedAmount = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(data.callAmount);

  return service.send({
    to,
    subject: `Capital Call Notice - ${data.fundName} - ${formattedAmount}`,
    text: `
Dear ${data.lpName},

This notice is to inform you of a capital call for ${data.fundName}.

Call Amount: ${formattedAmount}
Call Date: ${data.callDate.toLocaleDateString()}
Due Date: ${data.dueDate.toLocaleDateString()}

Purpose: ${data.purpose}

Wire Instructions:
Bank: ${data.wireInstructions.bankName}
Account Name: ${data.wireInstructions.accountName}
Account Number: ${data.wireInstructions.accountNumber}
Routing Number: ${data.wireInstructions.routingNumber}
Reference: ${data.wireInstructions.reference}

Please ensure funds are received by the due date.

Best regards,
Press On Capital
    `.trim(),
    tags: ['capital-call', 'notification'],
    metadata: {
      fundName: data.fundName,
      callAmount: data.callAmount.toString(),
    },
  });
}

/**
 * Send distribution notification email
 */
export async function sendDistributionEmail(
  to: EmailAddress,
  data: DistributionEmailData
): Promise<SendResult> {
  const service = getEmailService();

  const formattedAmount = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(data.distributionAmount);

  return service.send({
    to,
    subject: `Distribution Notice - ${data.fundName} - ${formattedAmount}`,
    text: `
Dear ${data.lpName},

We are pleased to inform you of a distribution from ${data.fundName}.

Distribution Amount: ${formattedAmount}
Distribution Date: ${data.distributionDate.toLocaleDateString()}
Type: ${data.distributionType.replace(/_/g, ' ')}

${
  data.breakdown
    ? `
Breakdown:
- Return of Capital: ${data.breakdown.returnOfCapital ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(data.breakdown.returnOfCapital) : 'N/A'}
- Income: ${data.breakdown.income ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(data.breakdown.income) : 'N/A'}
- Capital Gains: ${data.breakdown.capitalGains ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(data.breakdown.capitalGains) : 'N/A'}
`
    : ''
}

Funds will be wired to your account on file.

Best regards,
Press On Capital
    `.trim(),
    tags: ['distribution', 'notification'],
  });
}

/**
 * Send report ready notification email
 */
export async function sendReportReadyEmail(
  to: EmailAddress,
  data: ReportReadyEmailData
): Promise<SendResult> {
  const service = getEmailService();

  return service.send({
    to,
    subject: `Your ${data.reportType} Report is Ready - ${data.reportPeriod}`,
    text: `
Dear ${data.lpName},

Your ${data.reportType} report for ${data.reportPeriod} is now available.

Download your report here:
${data.downloadUrl}

This link will expire on ${data.expiresAt.toLocaleDateString()} at ${data.expiresAt.toLocaleTimeString()}.

Best regards,
Press On Capital
    `.trim(),
    tags: ['report', 'notification'],
  });
}
