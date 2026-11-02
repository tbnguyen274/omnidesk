import type * as PrismaRuntime from "@prisma/client";

/** The selected checkout owns its generated CJS client, including base releases. */
export function loadPrisma(requireFrom: NodeRequire): typeof PrismaRuntime {
  return requireFrom("@prisma/client") as typeof PrismaRuntime;
}

export function loadPrismaService(
  requireFrom: NodeRequire,
  modulePath: string,
): typeof PrismaRuntime.PrismaClient {
  const compiled = requireFrom(modulePath) as {
    PrismaService: typeof PrismaRuntime.PrismaClient;
  };
  return compiled.PrismaService;
}
