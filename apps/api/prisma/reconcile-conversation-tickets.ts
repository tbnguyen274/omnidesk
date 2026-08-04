import '../src/config/env-file';
import { PrismaClient } from '@prisma/client';
import { getExpectedTicketProjection } from '../src/modules/tickets/ticket-consistency';

const prisma = new PrismaClient();
const applyChanges = process.argv.includes('--apply');
const unknownArguments = process.argv
  .slice(2)
  .filter((arg) => arg !== '--apply' && arg !== '--');

type Drift = {
  ticketId: string;
  conversationId: string;
  current: {
    status: string;
    priority: string;
    assignedAgentId: string | null;
  };
  expected: ReturnType<typeof getExpectedTicketProjection>;
};

async function main() {
  if (unknownArguments.length > 0) {
    throw new Error(`Unknown arguments: ${unknownArguments.join(', ')}`);
  }

  const tickets = await prisma.ticket.findMany({
    select: {
      id: true,
      conversationId: true,
      status: true,
      priority: true,
      assignedAgentId: true,
      conversation: {
        select: {
          status: true,
          priority: true,
          assignedAgentId: true,
        },
      },
    },
  });

  const drift: Drift[] = tickets.flatMap((ticket) => {
    const expected = getExpectedTicketProjection(ticket.conversation);
    const isConsistent =
      ticket.status === expected.status &&
      ticket.priority === expected.priority &&
      ticket.assignedAgentId === expected.assignedAgentId;

    return isConsistent
      ? []
      : [
          {
            ticketId: ticket.id,
            conversationId: ticket.conversationId,
            current: {
              status: ticket.status,
              priority: ticket.priority,
              assignedAgentId: ticket.assignedAgentId,
            },
            expected,
          },
        ];
  });

  console.log(
    JSON.stringify(
      {
        mode: applyChanges ? 'apply' : 'dry-run',
        scanned: tickets.length,
        drifted: drift.length,
        details: drift.slice(0, 100),
        detailsTruncated: drift.length > 100,
      },
      null,
      2,
    ),
  );

  if (!applyChanges || drift.length === 0) {
    return;
  }

  for (let index = 0; index < drift.length; index += 100) {
    const batch = drift.slice(index, index + 100);
    await prisma.$transaction(
      batch.map((item) =>
        prisma.ticket.update({
          where: { id: item.ticketId },
          data: item.expected,
        }),
      ),
    );
  }

  console.log(`Reconciled ${drift.length} ticket records.`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
