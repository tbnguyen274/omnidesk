import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppController } from './../src/app.controller';
import { AppService } from './../src/app.service';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        {
          provide: AppService,
          useValue: {
            getHealth: jest.fn().mockResolvedValue({
              success: true,
              data: {
                service: 'worker',
                status: 'ok',
                checks: {
                  redis: { status: 'ok' },
                  queues: ['inbound-events'],
                },
              },
            }),
          },
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          success: true,
          data: {
            service: 'worker',
            status: 'ok',
          },
        });
      });
  });

  afterEach(async () => {
    await app.close();
  });
});
