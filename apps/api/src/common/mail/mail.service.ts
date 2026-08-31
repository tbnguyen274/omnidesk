import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { providerConfig } from '../../config/provider.config';

export type SendMailOptions = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  /**
   * Sends an email via SMTP if configured and live, or logs to console/logger in mock mode.
   */
  async sendMail(options: SendMailOptions): Promise<void> {
    if (
      providerConfig.email.outboundMode !== 'mock' &&
      providerConfig.email.smtp.host
    ) {
      const transporter = nodemailer.createTransport({
        host: providerConfig.email.smtp.host,
        port: providerConfig.email.smtp.port,
        secure: providerConfig.email.smtp.secure,
        auth: {
          user: providerConfig.email.smtp.user,
          pass: providerConfig.email.smtp.password,
        },
      });

      await transporter.sendMail({
        from: providerConfig.email.smtp.fromAddress,
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
      });
    } else {
      this.logger.debug(`[Mock Email] To: ${options.to}`);
      this.logger.debug(`[Mock Email] Subject: ${options.subject}`);
      this.logger.debug(`[Mock Email] Text: ${options.text}`);
    }
  }

  /**
   * Sends a password reset email to the user.
   */
  async sendPasswordResetEmail(email: string, resetUrl: string): Promise<void> {
    if (
      providerConfig.email.outboundMode !== 'mock' &&
      providerConfig.email.smtp.host
    ) {
      await this.sendMail({
        to: email,
        subject: 'Password Reset Request',
        text: `You requested a password reset. Please click the link to reset your password: ${resetUrl}`,
        html: `<p>You requested a password reset.</p><p><a href="${resetUrl}">Click here to reset your password</a>.</p>`,
      });
    } else {
      this.logger.debug(`[Mock Email] Password reset requested for ${email}`);
      this.logger.debug(`[Mock Email] Click here to reset: ${resetUrl}`);
    }
  }

  /**
   * Sends an account welcome and invitation email to a newly created user.
   */
  async sendWelcomeEmail(
    user: { name: string; email: string; role: string },
    resetUrl: string,
  ): Promise<void> {
    if (
      providerConfig.email.outboundMode !== 'mock' &&
      providerConfig.email.smtp.host
    ) {
      await this.sendMail({
        to: user.email,
        subject: 'Welcome to OmniDesk! Set up your account',
        text: `Hello ${user.name}, welcome to OmniDesk. Please set your password by clicking this link: ${resetUrl}`,
        html: `<p>Hello ${user.name},</p><p>Welcome to OmniDesk! You have been invited as a ${user.role}.</p><p><a href="${resetUrl}">Click here to set your password and log in</a>.</p>`,
      });
    } else {
      this.logger.debug(`[Mock Email] Welcome email for ${user.email}`);
      this.logger.debug(`[Mock Email] Set password link: ${resetUrl}`);
    }
  }
}
