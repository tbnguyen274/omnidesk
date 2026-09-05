import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';

/**
 * Fallback UUID used for anonymous/unauthenticated security events (e.g. login failure with unknown email)
 * to satisfy the UUID database constraint on target_id.
 */
export const SYSTEM_DUMMY_UUID = '00000000-0000-0000-0000-000000000000';

export type AuditLogInput = {
  actorId?: string | null;
  action: string;
  targetType: string;
  targetId: string;
  metadata?: Record<string, unknown>;
};

/**
 * AuditLogService writes structured audit trail entries to the audit_logs table.
 * All mutations involving security-sensitive operations should call this service.
 */
@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  log(input: AuditLogInput) {
    return this.prisma.auditLog.create({
      data: {
        actorId: input.actorId ?? null,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });
  }
}
