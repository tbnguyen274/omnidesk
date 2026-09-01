import { Module } from '@nestjs/common';
import * as Minio from 'minio';
import { StorageService } from './storage.service';
import { MINIO_BUCKET, MINIO_CLIENT } from './storage.tokens';

export { MINIO_BUCKET, MINIO_CLIENT };

@Module({
  providers: [
    {
      provide: MINIO_BUCKET,
      useFactory: () => process.env.MINIO_BUCKET ?? 'omnidesk',
    },
    {
      provide: MINIO_CLIENT,
      useFactory: () => {
        const endpoint = process.env.MINIO_ENDPOINT ?? 'localhost';
        const port = parseInt(process.env.MINIO_PORT ?? '9000', 10);
        const useSSL = process.env.MINIO_USE_SSL === 'true';
        return new Minio.Client({
          endPoint: endpoint,
          port,
          useSSL,
          accessKey: process.env.MINIO_ACCESS_KEY ?? 'omnidesk',
          secretKey: process.env.MINIO_SECRET_KEY ?? 'omnidesk123',
        });
      },
    },
    StorageService,
  ],
  exports: [StorageService, MINIO_CLIENT, MINIO_BUCKET],
})
export class StorageModule {}
