import { ForbiddenException } from '@nestjs/common';
import { providerConfig } from '../../../config/provider.config';
import { FacebookSignatureService } from './facebook-signature.service';

describe('FacebookSignatureService', () => {
  const service = new FacebookSignatureService();
  const originalRequired = providerConfig.facebook.webhookSignatureRequired;
  const originalAppSecret = providerConfig.facebook.appSecret;

  afterEach(() => {
    setFacebookSignatureConfig(originalRequired, originalAppSecret);
  });

  it('accepts a valid x-hub-signature-256 header', () => {
    setFacebookSignatureConfig(true, 'app-secret');
    const rawBody = Buffer.from('{"object":"page"}');
    const signature = `sha256=${service.createSignature(rawBody, 'app-secret')}`;

    expect(() => service.verifyRequest(rawBody, signature)).not.toThrow();
  });

  it('rejects an invalid x-hub-signature-256 header', () => {
    setFacebookSignatureConfig(true, 'app-secret');
    const rawBody = Buffer.from('{"object":"page"}');

    expect(() => service.verifyRequest(rawBody, 'sha256=deadbeef')).toThrow(
      ForbiddenException,
    );
  });

  it('rejects missing signature when required', () => {
    setFacebookSignatureConfig(true, 'app-secret');

    expect(() =>
      service.verifyRequest(Buffer.from('{"object":"page"}'), undefined),
    ).toThrow(ForbiddenException);
  });

  it('skips validation when signature is not required', () => {
    setFacebookSignatureConfig(false, undefined);

    expect(() => service.verifyRequest(undefined, undefined)).not.toThrow();
  });
});

function setFacebookSignatureConfig(
  webhookSignatureRequired: boolean,
  appSecret: string | undefined,
) {
  Object.assign(providerConfig.facebook, {
    webhookSignatureRequired,
    appSecret,
  });
}
