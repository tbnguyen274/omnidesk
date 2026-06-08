import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { QueueService } from './queue/queue.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        {
          provide: QueueService,
          useValue: {
            ping: jest.fn().mockResolvedValue('PONG'),
            getQueueNames: jest.fn().mockReturnValue(['inbound-events']),
          },
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return worker health', async () => {
      await expect(appController.getHealth()).resolves.toMatchObject({
        success: true,
        data: {
          service: 'worker',
          status: 'ok',
        },
      });
    });
  });
});
