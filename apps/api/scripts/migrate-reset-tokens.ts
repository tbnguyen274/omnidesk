import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

async function main() {
  console.log('[Migration] Starting reset tokens migration...');

  // 1. Clear expired password reset tokens
  const expiredResult = await prisma.user.updateMany({
    where: {
      passwordResetExpires: {
        lt: new Date(),
      },
      passwordResetToken: {
        not: null,
      },
    },
    data: {
      passwordResetToken: null,
      passwordResetExpires: null,
    },
  });
  console.log(
    `[Migration] Cleared ${expiredResult.count} expired reset token(s).`,
  );

  // 2. Find any remaining active tokens that are still plaintext (length == 36 for standard UUID)
  const usersWithActiveTokens = await prisma.user.findMany({
    where: {
      passwordResetToken: {
        not: null,
      },
      passwordResetExpires: {
        gte: new Date(),
      },
    },
    select: {
      id: true,
      email: true,
      passwordResetToken: true,
    },
  });

  let migratedCount = 0;
  for (const user of usersWithActiveTokens) {
    if (user.passwordResetToken && user.passwordResetToken.length === 36) {
      const hashedToken = crypto
        .createHash('sha256')
        .update(user.passwordResetToken)
        .digest('hex');

      await prisma.user.update({
        where: { id: user.id },
        data: { passwordResetToken: hashedToken },
      });
      migratedCount++;
    }
  }

  console.log(
    `[Migration] Successfully hashed ${migratedCount} active plaintext reset token(s) to SHA-256.`,
  );
  console.log('[Migration] Reset tokens migration finished successfully.');
}

main()
  .catch((e) => {
    console.error('[Migration] Error during migration:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
