import { createRequire } from "node:module";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { loadPrisma, loadPrismaService } from "./lib/prisma-runtime.mts";

// Exercise the compiled API/Worker write paths from the selected checkout.
async function main() {
  if (!process.argv[2]) throw new Error("Provide a checkout path");
  const root = resolve(process.argv[2]);
  const apiRequire = createRequire(resolve(root, "apps/api/package.json"));
  const workerRequire = createRequire(
    resolve(root, "apps/worker/package.json"),
  );
  const {
    ChannelAccountType,
    ChannelType,
    ConversationStatus,
    InboundProvider,
    InboundEventType,
    MessageContentType,
    MessageDirection,
    MessageSenderType,
  } = loadPrisma(apiRequire);
  const PrismaService = loadPrismaService(
    apiRequire,
    "./dist/common/database/prisma.service.js",
  );
  const { ConversationsRepository } = apiRequire(
    "./dist/modules/conversations/conversations.repository.js",
  );
  const { OutboxService } = apiRequire(
    "./dist/common/outbox/outbox.service.js",
  );
  const { InboundEventRepository } = workerRequire(
    "./dist/inbound/ingestion/inbound-event.repository.js",
  );
  const { InboundIngestionRepository } = workerRequire(
    "./dist/inbound/ingestion/inbound-ingestion.repository.js",
  );
  const { InboundIngestionService } = workerRequire(
    "./dist/inbound/ingestion/inbound-ingestion.service.js",
  );
  const prisma = new PrismaService({
    datasourceUrl: process.env.COMPAT_DATABASE_URL,
  });
  try {
    const key = randomUUID();
    const events = new InboundEventRepository(prisma);
    const ingestion = new InboundIngestionService(
      prisma,
      new InboundIngestionRepository(),
      events,
    );
    const create = async (suffix: string) => {
      const event = await prisma.inboundEvent.create({
        data: {
          provider: InboundProvider.EMAIL,
          eventType: InboundEventType.EMAIL_RECEIVED,
          dedupKey: `compat:${key}:${suffix}`,
          rawPayload: {},
        },
      });
      const claim = await events.claim(event.id);
      if (!claim) throw new Error("Cannot claim compatibility fixture");
      return ingestion.ingest(claim, {
        channelType: ChannelType.EMAIL,
        account: {
          type: ChannelAccountType.EMAIL,
          externalId: `compat:${key}`,
          displayName: "Compatibility test",
          defaultConfig: {},
        },
        customer: {
          identity: { kind: "email", value: `${key}@compat.invalid` },
          name: "Compatibility test",
        },
        externalConversationId: key,
        externalMessageId: `${key}:${suffix}`,
        content: "Compatibility test",
        contentType: MessageContentType.TEXT,
        direction: MessageDirection.INBOUND,
        senderType: MessageSenderType.CUSTOMER,
        receivedAt: new Date(),
        attachments: [],
        presentation: { subject: "Compatibility", subjectStyle: "email" },
      });
    };
    const first = await create("first");
    const repository = new ConversationsRepository(
      prisma,
      new OutboxService(prisma),
      { trigger() {} },
    );
    const conversation = await prisma.conversation.findUniqueOrThrow({
      where: { id: first.conversationId },
    });
    await repository.updateStatus(
      conversation.id,
      ConversationStatus.WAITING_CUSTOMER,
      conversation.version,
    );
    await create("second");
    const updated = await prisma.conversation.findUniqueOrThrow({
      where: { id: conversation.id },
      include: { ticket: true, messages: true },
    });
    if (
      !updated.ticket ||
      updated.messages.length !== 2 ||
      updated.version <= conversation.version
    )
      throw new Error("Runtime schema write/read contract failed");
    // Leave the row present: the subsequent migration must preserve existing data.
    console.log("Compiled API and Worker schema contracts passed");
  } finally {
    await prisma.$disconnect();
  }
}
main().catch(() => {
  console.error("Runtime schema contract failed (details suppressed).");
  process.exitCode = 1;
});
