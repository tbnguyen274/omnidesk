import {
  getPaginationParams,
  createPaginatedResponse,
  InboundEmailPayloadSchema,
  FacebookMessagePayloadSchema,
  FacebookCommentPayloadSchema,
} from '@omnidesk/shared';

describe('Shared Foundation (DRY Pagination & Zod Validation)', () => {
  describe('Pagination Utilities', () => {
    it('computes correct skip and take with default values', () => {
      const result = getPaginationParams({});
      expect(result).toEqual({
        page: 1,
        limit: 20,
        skip: 0,
        take: 20,
      });
    });

    it('clamps page to min 1 and limit to max 100', () => {
      const result = getPaginationParams({ page: -5, limit: 500 });
      expect(result).toEqual({
        page: 1,
        limit: 100,
        skip: 0,
        take: 100,
      });
    });

    it('calculates non-trivial page offsets accurately', () => {
      const result = getPaginationParams({ page: 4, limit: 15 });
      expect(result).toEqual({
        page: 4,
        limit: 15,
        skip: 45,
        take: 15,
      });
    });

    it('creates standard paginated response shape', () => {
      const items = [{ id: '1' }, { id: '2' }];
      const response = createPaginatedResponse(items, 10, 1, 2);
      expect(response).toEqual({
        items,
        total: 10,
        page: 1,
        limit: 2,
      });
    });
  });

  describe('Zod Validation Schemas', () => {
    describe('InboundEmailPayloadSchema', () => {
      it('validates a correct email payload successfully', () => {
        const validPayload = {
          mailbox: 'support@omnidesk.local',
          messageId: '<msg-123@example.com>',
          fromEmail: 'customer@example.com',
          fromName: 'Customer Name',
          subject: 'Help Needed',
          text: 'Please help me with my order.',
        };

        const result = InboundEmailPayloadSchema.safeParse(validPayload);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.fromEmail).toBe('customer@example.com');
          expect(result.data.subject).toBe('Help Needed');
        }
      });

      it('rejects payload with invalid email address', () => {
        const invalidPayload = {
          mailbox: 'support@omnidesk.local',
          messageId: '<msg-123@example.com>',
          fromEmail: 'not-an-email',
          subject: 'Help',
        };

        const result = InboundEmailPayloadSchema.safeParse(invalidPayload);
        expect(result.success).toBe(false);
      });

      it('rejects payload missing required messageId or mailbox', () => {
        const missingFields = {
          fromEmail: 'customer@example.com',
          subject: 'Help',
        };

        const result = InboundEmailPayloadSchema.safeParse(missingFields);
        expect(result.success).toBe(false);
      });
    });

    describe('FacebookMessagePayloadSchema', () => {
      it('validates a valid message payload', () => {
        const payload = {
          pageId: 'page-1',
          senderId: 'user-1',
          messageId: 'mid-1',
          text: 'Hello OmniDesk',
        };

        const result = FacebookMessagePayloadSchema.safeParse(payload);
        expect(result.success).toBe(true);
      });

      it('rejects message with empty text or missing senderId', () => {
        const payload = {
          pageId: 'page-1',
          messageId: 'mid-1',
          text: '',
        };

        const result = FacebookMessagePayloadSchema.safeParse(payload);
        expect(result.success).toBe(false);
      });
    });

    describe('FacebookCommentPayloadSchema', () => {
      it('validates a valid comment payload', () => {
        const payload = {
          pageId: 'page-1',
          postId: 'post-10',
          commentId: 'comment-20',
          commenterId: 'user-2',
          text: 'Great post!',
        };

        const result = FacebookCommentPayloadSchema.safeParse(payload);
        expect(result.success).toBe(true);
      });
    });
  });
});
