import { Readable } from 'stream';
import { StorageService } from './storage.service';

describe('StorageService', () => {
  let service: StorageService;
  let mockMinioClient: any;
  const mockBucket = 'test-bucket';

  beforeEach(() => {
    mockMinioClient = {
      getObject: jest.fn(),
      statObject: jest.fn(),
      putObject: jest.fn(),
    };
    service = new StorageService(mockMinioClient, mockBucket);
  });

  it('retrieves an object as a Buffer via getObject', async () => {
    const stream = new Readable();
    stream.push(Buffer.from('hello world'));
    stream.push(null);

    mockMinioClient.getObject.mockResolvedValue(stream);

    const result = await service.getObject('test-key.txt');
    expect(mockMinioClient.getObject).toHaveBeenCalledWith(
      'test-bucket',
      'test-key.txt',
    );
    expect(result.toString('utf-8')).toBe('hello world');
  });

  it('checks if an object exists via hasObject', async () => {
    mockMinioClient.statObject.mockResolvedValueOnce({ size: 100 });
    await expect(service.hasObject('exists.txt')).resolves.toBe(true);

    mockMinioClient.statObject.mockRejectedValueOnce(new Error('NotFound'));
    await expect(service.hasObject('not-found.txt')).resolves.toBe(false);
  });

  it('puts an object into the bucket via putObject', async () => {
    mockMinioClient.putObject.mockResolvedValueOnce(undefined);
    const buf = Buffer.from('data');

    await service.putObject('key.png', buf, 'image/png');
    expect(mockMinioClient.putObject).toHaveBeenCalledWith(
      'test-bucket',
      'key.png',
      buf,
      buf.length,
      { 'Content-Type': 'image/png' },
    );
  });
});
