import { randomUUID } from 'crypto';
import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

const REQUEST_ID_HEADER = 'x-request-id';
const logger = new Logger('HTTP');

function getRequestId(req: Request) {
  const incomingRequestId = req.header(REQUEST_ID_HEADER);

  return incomingRequestId && incomingRequestId.trim().length > 0
    ? incomingRequestId
    : randomUUID();
}

function shouldLogRequest(path: string) {
  return !path.endsWith('/health');
}

export function requestLoggerMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const requestId = getRequestId(req);
  const startedAt = Date.now();

  req.headers[REQUEST_ID_HEADER] = requestId;
  res.setHeader(REQUEST_ID_HEADER, requestId);

  res.on('finish', () => {
    if (!shouldLogRequest(req.path)) {
      return;
    }

    const durationMs = Date.now() - startedAt;
    const userAgent = req.header('user-agent') ?? 'unknown';
    const message = [
      `requestId=${requestId}`,
      `method=${req.method}`,
      `path=${req.originalUrl}`,
      `status=${res.statusCode}`,
      `durationMs=${durationMs}`,
      `ip=${req.ip}`,
      `userAgent="${userAgent}"`,
    ].join(' ');

    if (res.statusCode >= 500) {
      logger.error(message);
      return;
    }

    if (res.statusCode >= 400) {
      logger.warn(message);
      return;
    }

    logger.log(message);
  });

  next();
}
