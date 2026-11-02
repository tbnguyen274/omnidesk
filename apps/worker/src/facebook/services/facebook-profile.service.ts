import { Injectable, Logger } from '@nestjs/common';
import { providerConfig } from '../../config/provider.config';
import type { NormalizedInboundMessage } from '../../inbound/inbound.types';
import { ChannelAccountCredentialsReader } from './channel-account-credentials.reader';

@Injectable()
export class FacebookProfileService {
  private readonly logger = new Logger(FacebookProfileService.name);
  constructor(private readonly credentials: ChannelAccountCredentialsReader) {}

  async enrich(
    customer: NormalizedInboundMessage['customer'],
    accountId?: string,
    pageId?: string,
  ) {
    const hasName = (name: string | null | undefined): name is string =>
      !!name?.trim() &&
      name.trim().toLowerCase() !== 'unknown customer' &&
      name.trim() !== customer.identity.value;
    // Read persisted profile before considering a provider request. Persistence
    // remains in the ingestion transaction after normalization.
    const stored = await this.credentials.customerProfile(
      customer.identity.value,
    );
    const storedName = stored?.name;
    if (hasName(storedName)) customer.name = storedName;
    if (stored?.avatarUrl) customer.avatarUrl = stored.avatarUrl;
    if (hasName(customer.name)) return;
    try {
      const token =
        (await this.credentials.accessToken(accountId, pageId)) ||
        (pageId && pageId === providerConfig.facebook.pageId
          ? providerConfig.facebook.pageAccessToken
          : undefined);
      if (!token) return;
      const url = new URL(
        `https://graph.facebook.com/${providerConfig.facebook.graphApiVersion}/${encodeURIComponent(customer.identity.value)}`,
      );
      url.searchParams.set('fields', 'first_name,last_name,picture');
      url.searchParams.set('access_token', token);
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) {
        this.logger.warn(
          `Facebook profile enrichment failed for page/account ${pageId ?? accountId}: HTTP ${response.status}`,
        );
        return;
      }
      const data = (await response.json()) as {
        first_name?: string;
        last_name?: string;
        picture?: { data?: { url?: string } };
      };
      const name = `${data.first_name || ''} ${data.last_name || ''}`.trim();
      if (hasName(name)) customer.name = name;
      if (data.picture?.data?.url) customer.avatarUrl = data.picture.data.url;
    } catch {
      // Do not log credential-bearing request URLs or provider response bodies.
      this.logger.warn(
        `Facebook profile enrichment failed for page/account ${pageId ?? accountId}`,
      );
    }
  }
}
