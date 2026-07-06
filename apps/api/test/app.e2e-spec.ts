import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, VersioningType } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppController } from './../src/app.controller';
import { AppService } from './../src/app.service';
import { providerConfig } from './../src/config/provider.config';
import { EventsService } from './../src/modules/events/events.service';
import { FacebookController } from './../src/modules/facebook/facebook.controller';
import { FacebookService } from './../src/modules/facebook/facebook.service';
import { FacebookSignatureService } from './../src/modules/facebook/services/facebook-signature.service';
import { FacebookWebhookParserService } from './../src/modules/facebook/services/facebook-webhook-parser.service';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AppController, FacebookController],
      providers: [
        AppService,
        FacebookService,
        FacebookSignatureService,
        FacebookWebhookParserService,
        {
          provide: EventsService,
          useValue: {
            createInbound: jest.fn(),
          },
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: '1',
    });
    await app.init();
  });

  it('/api (GET)', () => {
    return request(app.getHttpServer())
      .get('/api')
      .expect(200)
      .expect('OmniDesk API is running');
  });

  it('/api/v1/webhooks/facebook verifies callback challenge', () => {
    const verifyToken =
      providerConfig.facebook.verifyToken ?? 'omnidesk-facebook-verify-token';

    return request(app.getHttpServer())
      .get('/api/v1/webhooks/facebook')
      .query({
        'hub.mode': 'subscribe',
        'hub.verify_token': verifyToken,
        'hub.challenge': 'fb-ok',
      })
      .expect(200)
      .expect('fb-ok');
  });

  it('/api/v1/webhooks/facebook rejects invalid verify token', () => {
    return request(app.getHttpServer())
      .get('/api/v1/webhooks/facebook')
      .query({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'wrong-token',
        'hub.challenge': 'fb-ok',
      })
      .expect(403);
  });

  afterEach(async () => {
    await app.close();
  });
});
