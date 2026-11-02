import { FacebookProfileService } from './facebook-profile.service';
import type { ChannelAccountCredentialsReader } from './channel-account-credentials.reader';
import type { NormalizedInboundMessage } from '../../inbound/inbound.types';

describe('Facebook profile enrichment', () => {
  afterEach(() => jest.restoreAllMocks());
  it('enriches missing profile data using read-only credentials', async () => {
    const credentials = {
      accessToken: jest.fn().mockResolvedValue('token'),
      customerProfile: jest.fn().mockResolvedValue(null),
    } satisfies Pick<
      ChannelAccountCredentialsReader,
      'accessToken' | 'customerProfile'
    >;
    const service = new FacebookProfileService(
      credentials as unknown as ChannelAccountCredentialsReader,
    );
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          first_name: 'Customer',
          last_name: 'Name',
          picture: { data: { url: 'https://image' } },
        }),
    } as Response);
    const customer: NormalizedInboundMessage['customer'] = {
      identity: { kind: 'facebook', value: 'id' },
      name: 'Unknown Customer',
    };
    await service.enrich(customer, 'account');
    expect(customer).toMatchObject({
      name: 'Customer Name',
      avatarUrl: 'https://image',
    });
    expect(credentials.customerProfile).toHaveBeenCalledWith('id');
    expect(credentials.accessToken).toHaveBeenCalledWith('account', undefined);
  });
  it('keeps original profile when the provider is unavailable', async () => {
    const service = new FacebookProfileService({
      accessToken: jest.fn().mockResolvedValue('token'),
      customerProfile: jest.fn().mockResolvedValue(null),
    } as unknown as ChannelAccountCredentialsReader);
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('timeout'));
    const customer: NormalizedInboundMessage['customer'] = {
      identity: { kind: 'facebook', value: 'id' },
      name: 'Unknown Customer',
    };
    await expect(service.enrich(customer, 'account')).resolves.toBeUndefined();
    expect(customer.name).toBe('Unknown Customer');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('reuses the persisted profile without requesting Facebook again', async () => {
    const credentials = {
      accessToken: jest.fn(),
      customerProfile: jest.fn().mockResolvedValue({
        name: 'Stored Customer',
        avatarUrl: 'https://image/stored',
      }),
    } satisfies Pick<
      ChannelAccountCredentialsReader,
      'accessToken' | 'customerProfile'
    >;
    const service = new FacebookProfileService(
      credentials as unknown as ChannelAccountCredentialsReader,
    );
    const fetchProfile = jest.spyOn(global, 'fetch');
    const customer: NormalizedInboundMessage['customer'] = {
      identity: { kind: 'facebook', value: 'id' },
      name: 'Unknown Customer',
    };

    await service.enrich(customer, undefined, 'page');

    expect(customer).toMatchObject({
      name: 'Stored Customer',
      avatarUrl: 'https://image/stored',
    });
    expect(credentials.accessToken).not.toHaveBeenCalled();
    expect(fetchProfile).not.toHaveBeenCalled();
  });
});
