import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AttachmentsService } from './attachments.service';

describe('AttachmentsService', () => {
  let service: AttachmentsService;
  let prisma: any;
  let storageService: any;

  beforeEach(() => {
    prisma = {
      attachment: {
        findUnique: jest.fn(),
      },
    };
    storageService = {
      hasObject: jest.fn(),
      getObject: jest.fn(),
      putObject: jest.fn(),
      upload: jest.fn(),
    };

    service = new AttachmentsService(prisma, storageService);
  });

  describe('uploadAttachment', () => {
    it('uploads valid image successfully', async () => {
      const mockFile: any = {
        buffer: Buffer.from('image content'),
        originalname: 'photo.png',
        mimetype: 'image/png',
        size: 1024,
      };

      storageService.upload.mockResolvedValueOnce({
        url: 'http://storage/photo.png',
        key: 'photo.png',
        fileName: 'photo.png',
        mimeType: 'image/png',
        sizeBytes: 1024,
      });

      const result = await service.uploadAttachment(mockFile);

      expect(result).toEqual({
        url: 'http://storage/photo.png',
        key: 'photo.png',
        fileName: 'photo.png',
        mimeType: 'image/png',
        sizeBytes: 1024,
      });
      expect(storageService.upload).toHaveBeenCalledWith(
        mockFile.buffer,
        'photo.png',
        'image/png',
      );
    });

    it('rejects unsupported file type with BadRequestException', async () => {
      const mockFile: any = {
        buffer: Buffer.from('malicious exe'),
        originalname: 'app.exe',
        mimetype: 'application/x-msdownload',
        size: 500,
      };

      await expect(service.uploadAttachment(mockFile)).rejects.toThrow(
        BadRequestException,
      );
      expect(storageService.upload).not.toHaveBeenCalled();
    });

    it('rejects oversized image (>5MB) with BadRequestException', async () => {
      const mockFile: any = {
        buffer: Buffer.alloc(6 * 1024 * 1024),
        originalname: 'huge.jpg',
        mimetype: 'image/jpeg',
        size: 6 * 1024 * 1024,
      };

      await expect(service.uploadAttachment(mockFile)).rejects.toThrow(
        BadRequestException,
      );
      expect(storageService.upload).not.toHaveBeenCalled();
    });

    it('rejects missing or empty file with BadRequestException', async () => {
      await expect(service.uploadAttachment(null as any)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('getAttachmentContent', () => {
    it('throws NotFoundException when attachment does not exist', async () => {
      prisma.attachment.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.getAttachmentContent('non-existent-id'),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns cached content when available in MinIO cache', async () => {
      prisma.attachment.findUnique.mockResolvedValueOnce({
        id: 'att-1',
        storageKey: 'regular-key',
        fileName: 'doc.pdf',
        mimeType: 'application/pdf',
      });
      storageService.hasObject.mockResolvedValueOnce(true);
      storageService.getObject.mockResolvedValueOnce(Buffer.from('cached pdf'));

      const result = await service.getAttachmentContent('att-1');

      expect(result).toEqual({
        buffer: Buffer.from('cached pdf'),
        fileName: 'doc.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 10,
      });
      expect(storageService.hasObject).toHaveBeenCalledWith(
        'cache/inbound/att-1',
      );
    });
  });
});
