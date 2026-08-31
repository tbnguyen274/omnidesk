import * as nodemailer from 'nodemailer';
import { providerConfig } from '../../config/provider.config';
import { MailService } from './mail.service';

jest.mock('nodemailer');

describe('MailService', () => {
  let service: MailService;
  let sendMailMock: jest.Mock;
  const originalOutboundMode = providerConfig.email.outboundMode;
  const originalSmtp = { ...providerConfig.email.smtp };

  beforeEach(() => {
    sendMailMock = jest.fn().mockResolvedValue({ messageId: 'msg-123' });
    (nodemailer.createTransport as jest.Mock).mockReturnValue({
      sendMail: sendMailMock,
    });
    service = new MailService();
  });

  afterEach(() => {
    jest.clearAllMocks();
    Object.assign(providerConfig.email, { outboundMode: originalOutboundMode });
    Object.assign(providerConfig.email.smtp, originalSmtp);
  });

  it('sends email via nodemailer in live mode with valid SMTP host', async () => {
    Object.assign(providerConfig.email, { outboundMode: 'live' });
    Object.assign(providerConfig.email.smtp, {
      host: 'smtp.example.com',
      port: 587,
      secure: false,
      user: 'user@example.com',
      password: 'secret',
      fromAddress: 'noreply@example.com',
    });

    await service.sendPasswordResetEmail(
      'agent@example.com',
      'http://localhost:3000/reset',
    );

    expect(nodemailer.createTransport).toHaveBeenCalledWith({
      host: 'smtp.example.com',
      port: 587,
      secure: false,
      auth: {
        user: 'user@example.com',
        pass: 'secret',
      },
    });

    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'noreply@example.com',
        to: 'agent@example.com',
        subject: 'Password Reset Request',
      }),
    );
  });

  it('logs debug message without calling nodemailer in mock mode', async () => {
    Object.assign(providerConfig.email, { outboundMode: 'mock' });

    const debugSpy = jest.spyOn((service as any).logger, 'debug');

    await service.sendWelcomeEmail(
      { name: 'John Doe', email: 'john@example.com', role: 'AGENT' },
      'http://localhost:3000/invite',
    );

    expect(nodemailer.createTransport).not.toHaveBeenCalled();
    expect(debugSpy).toHaveBeenCalledWith(
      expect.stringContaining('[Mock Email] Welcome email for john@example.com'),
    );
  });
});
