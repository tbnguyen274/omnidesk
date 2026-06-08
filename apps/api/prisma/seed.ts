import { PrismaClient, UserRole } from '@prisma/client';
import { hash } from 'bcryptjs';

const prisma = new PrismaClient();

async function upsertUser(params: {
  email: string;
  name: string;
  role: UserRole;
}) {
  const passwordHash = await hash('password', 10);

  return prisma.user.upsert({
    where: { email: params.email },
    update: {
      name: params.name,
      role: params.role,
      status: 'ACTIVE',
    },
    create: {
      email: params.email,
      name: params.name,
      passwordHash,
      role: params.role,
      status: 'ACTIVE',
    },
  });
}

async function main() {
  await upsertUser({
    email: 'admin@omnidesk.local',
    name: 'OmniDesk Admin',
    role: UserRole.ADMIN,
  });

  await upsertUser({
    email: 'agent@omnidesk.local',
    name: 'OmniDesk Agent',
    role: UserRole.AGENT,
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
