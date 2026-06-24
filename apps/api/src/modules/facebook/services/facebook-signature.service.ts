import { createHmac, timingSafeEqual } from 'node:crypto';
import { ForbiddenException, Injectable } from '@nestjs/common';
import { providerConfig } from '../../../config/provider.config';

@Injectable()
export class FacebookSignatureService {
  verifyRequest(rawBody: Buffer | undefined, signature: string | undefined) {
    if (!providerConfig.facebook.webhookSignatureRequired) {
      return;
    }

    const appSecret = providerConfig.facebook.appSecret;

    if (!appSecret || !rawBody || !signature) {
      throw new ForbiddenException('Invalid Facebook webhook signature');
    }

    if (!this.isValidSignature(rawBody, signature, appSecret)) {
      throw new ForbiddenException('Invalid Facebook webhook signature');
    }
  }

  isValidSignature(rawBody: Buffer, signature: string, appSecret: string) {
    const expectedSignature = this.createSignature(rawBody, appSecret);

    if (!signature.startsWith('sha256=')) {
      return false;
    }

    const actualHex = signature.slice('sha256='.length);

    if (!/^[a-f0-9]+$/i.test(actualHex)) {
      return false;
    }

    const expected = Buffer.from(expectedSignature, 'hex');
    const actual = Buffer.from(actualHex, 'hex');

    return (
      expected.length === actual.length && timingSafeEqual(expected, actual)
    );
  }

  createSignature(rawBody: Buffer, appSecret: string) {
    return createHmac('sha256', appSecret).update(rawBody).digest('hex');
  }
}
