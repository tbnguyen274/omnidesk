import { Injectable, Logger } from '@nestjs/common';
import * as Minio from 'minio';
import { randomUUID } from 'crypto';
import * as path from 'path';

export type UploadResult = {
  key: string;
  url: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: Minio.Client;
  private readonly bucket: string;
  private readonly publicUrl: string;

  constructor() {
    const endpoint = process.env.MINIO_ENDPOINT ?? 'localhost';
    const port = parseInt(process.env.MINIO_PORT ?? '9000', 10);
    const useSSL = process.env.MINIO_USE_SSL === 'true';
    this.bucket = process.env.MINIO_BUCKET ?? 'omnidesk';
    this.publicUrl =
      process.env.MINIO_PUBLIC_URL ??
      `http://${endpoint}:${port}/${this.bucket}`;

    this.client = new Minio.Client({
      endPoint: endpoint,
      port,
      useSSL,
      accessKey: process.env.MINIO_ACCESS_KEY ?? 'omnidesk',
      secretKey: process.env.MINIO_SECRET_KEY ?? 'omnidesk123',
    });

    void this.ensureBucket();
  }

  private async ensureBucket() {
    try {
      const exists = await this.client.bucketExists(this.bucket);
      if (!exists) {
        await this.client.makeBucket(this.bucket);
        // Set public read policy so attachment URLs are accessible
        await this.client.setBucketPolicy(
          this.bucket,
          JSON.stringify({
            Version: '2012-10-17',
            Statement: [
              {
                Effect: 'Allow',
                Principal: { AWS: ['*'] },
                Action: ['s3:GetObject'],
                Resource: [`arn:aws:s3:::${this.bucket}/*`],
              },
            ],
          }),
        );
        this.logger.log(
          `Bucket "${this.bucket}" created with public read policy`,
        );
      }
    } catch (err) {
      this.logger.warn(`Failed to ensure MinIO bucket: ${String(err)}`);
    }
  }

  async upload(
    buffer: Buffer,
    originalName: string,
    mimeType: string,
    folder = 'attachments',
  ): Promise<UploadResult> {
    const ext = path.extname(originalName);
    const key = `${folder}/${randomUUID()}${ext}`;

    await this.client.putObject(this.bucket, key, buffer, buffer.length, {
      'Content-Type': mimeType,
      'x-amz-meta-original-name': encodeURIComponent(originalName),
    });

    const url = `${this.publicUrl}/${key}`;

    this.logger.log(
      `Uploaded file: ${key} (${mimeType}, ${buffer.length} bytes)`,
    );

    return {
      key,
      url,
      fileName: originalName,
      mimeType,
      sizeBytes: buffer.length,
    };
  }

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

  async hasObject(key: string): Promise<boolean> {
    try {
      await this.client.statObject(this.bucket, key);
      return true;
    } catch {
      return false;
    }
  }

  async getObject(key: string): Promise<Buffer> {
    const stream = await this.client.getObject(this.bucket, key);
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  }

  async getStream(key: string) {
    return this.client.getObject(this.bucket, key);
  }
}
