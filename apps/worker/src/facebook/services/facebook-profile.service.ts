import { Injectable, Logger } from '@nestjs/common';
import type { NormalizedInboundMessage } from '../../inbound/inbound.types';
import { ChannelAccountCredentialsReader } from './channel-account-credentials.reader';

@Injectable()
export class FacebookProfileService {
  private readonly logger = new Logger(FacebookProfileService.name);
  constructor(private readonly credentials: ChannelAccountCredentialsReader) {}

  async enrich(
    customer: NormalizedInboundMessage['customer'],
    accountId: string,
  ) {
    if (
      customer.name &&
      customer.name !== 'Unknown Customer' &&
      customer.avatarUrl
    )
      return;
    try {
      const token = await this.credentials.accessToken(accountId);
      if (!token) return;
      const url = new URL(
        `https://graph.facebook.com/v19.0/${encodeURIComponent(customer.identity.value)}`,
      );
      url.searchParams.set('fields', 'first_name,last_name,picture');
      url.searchParams.set('access_token', token);
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) return;
      const data = (await response.json()) as {
        first_name?: string;
        last_name?: string;
        picture?: { data?: { url?: string } };
      };
      const name = `${data.first_name || ''} ${data.last_name || ''}`.trim();
      if (name && (!customer.name || customer.name === 'Unknown Customer'))
        customer.name = name;
      if (data.picture?.data?.url) customer.avatarUrl = data.picture.data.url;
    } catch {
      // Do not log credential-bearing request URLs or provider response bodies.
      this.logger.warn(
        `Facebook profile enrichment failed for account ${accountId}`,
      );
    }
  }
}
