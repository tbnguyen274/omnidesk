import {
  decideInboundConversation,
  initialTicketDeadline,
} from './inbound.policy';
import { inboundSubject } from '../presentation';
import { ConversationStatus, Priority } from '@prisma/client';

describe('pure inbound policies', () => {
  it('preserves creation and lifecycle decisions independently of provider', () => {
    expect(decideInboundConversation()).toEqual({
      createNew: true,
      reopen: false,
    });
    expect(decideInboundConversation(ConversationStatus.CLOSED)).toEqual({
      createNew: true,
      reopen: false,
    });
    expect(decideInboundConversation(ConversationStatus.RESOLVED)).toEqual({
      createNew: false,
      reopen: true,
    });
    for (const status of [
      ConversationStatus.NEW,
      ConversationStatus.IN_PROGRESS,
      ConversationStatus.WAITING_CUSTOMER,
    ] as const) {
      expect(decideInboundConversation(status)).toEqual({
        createNew: false,
        reopen: false,
      });
    }
  });
  it('does not reset an existing ticket deadline', () => {
    expect(initialTicketDeadline(true, Priority.URGENT, new Date())).toBeNull();
  });
  it('preserves channel subject compatibility without involving lifecycle rules', () => {
    expect(
      inboundSubject('', { subject: 'Email', subjectStyle: 'email' }),
    ).toBe('');
    expect(
      inboundSubject('Manual', {
        subject: 'Facebook',
        subjectStyle: 'facebook',
      }),
    ).toBe('Manual');
    expect(
      inboundSubject('Facebook Messenger - Unknown Customer', {
        subject: 'Updated',
        subjectStyle: 'facebook',
      }),
    ).toBe('Updated');
  });
});
