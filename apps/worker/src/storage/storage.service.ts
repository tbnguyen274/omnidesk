import { Inject, Injectable } from '@nestjs/common';
import * as Minio from 'minio';
import { Readable } from 'stream';
import { MINIO_BUCKET, MINIO_CLIENT } from './storage.module';

@Injectable()
export class StorageService {
  constructor(
    @Inject(MINIO_CLIENT) private readonly client: Minio.Client,
    @Inject(MINIO_BUCKET) private readonly bucket: string,
  ) {}

  /**
   * Retrieves an object stream from MinIO bucket.
   */
  async getStream(key: string): Promise<Readable> {
    return this.client.getObject(this.bucket, key);
  }

  /**
   * Retrieves an object as a Buffer from MinIO bucket.
   */
  async getObject(key: string): Promise<Buffer> {
    const stream = await this.getStream(key);
    return new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  }

  /**
   * Checks if an object exists in MinIO bucket.
   */
  async hasObject(key: string): Promise<boolean> {
    try {
      await this.client.statObject(this.bucket, key);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Puts an object buffer into MinIO bucket.
   */
  async putObject(
    key: string,
    buffer: Buffer,
    mimeType: string,
    metadata?: Record<string, string>,
  ): Promise<void> {
    await this.client.putObject(this.bucket, key, buffer, buffer.length, {
      'Content-Type': mimeType,
      ...metadata,
    });
  }
}
