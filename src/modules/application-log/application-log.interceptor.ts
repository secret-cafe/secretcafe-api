import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Response as ExpressResponse } from 'express';
import { randomUUID } from 'crypto';
import { Prisma } from 'generated/prisma/client';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { sanitizeValue } from 'src/common/utils/sanitize';
import {
  ApplicationLogService,
  CreateApplicationLogInput,
} from './application-log.service';

/**
 * Minimal authenticated user shape attached by the JWT strategy.
 * - `currentUserId`: public user UUID (`UserInfo.userId`).
 * - `userId`: internal numeric user id (`UserInfo.id`), used for `createdBy`.
 */
export interface UserLike {
  currentUserId?: unknown;
  userId?: unknown;
}

/** Minimal shape of the Express request relevant to logging. */
export interface LoggableRequest {
  method?: unknown;
  originalUrl?: unknown;
  url?: unknown;
  headers?: Record<string, unknown>;
  body?: unknown;
  user?: UserLike;
  ip?: unknown;
  socket?: { remoteAddress?: unknown };
  connection?: { remoteAddress?: unknown };
}

/**
 * Global interceptor that captures incoming HTTP requests and outgoing
 * responses into the `ApplicationLog` table (Laravel Telescope style).
 *
 * - GET requests are intentionally not stored/logged.
 * - Logging is fire-and-forget and never breaks the original request flow.
 * - Request/response payloads are recursively sanitized before being stored.
 */
@Injectable()
export class ApplicationLogInterceptor implements NestInterceptor {
  constructor(private readonly applicationLogService: ApplicationLogService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const http = context.switchToHttp();
    const request = http.getRequest<LoggableRequest>();
    const response = http.getResponse<ExpressResponse>();

    // GET requests are intentionally not stored/logged.
    if (request.method === 'GET') {
      return next.handle();
    }

    const startedAt = Date.now();
    const requestId = this.resolveRequestId(request);
    const method =
      typeof request.method === 'string' && request.method.length > 0
        ? request.method.toUpperCase()
        : 'UNKNOWN';
    const path =
      typeof request.originalUrl === 'string'
        ? request.originalUrl
        : typeof request.url === 'string'
          ? request.url
          : '';
    const moduleName = this.resolveModuleName(context.getClass()?.name);
    const ip = this.resolveClientIp(request);
    const userId = this.resolveUserId(request.user);
    const createdBy = this.resolveCreatedBy(request.user);
    const requestHeaders = sanitizeValue(
      this.requestHeadersToRecord(request.headers),
    );
    const requestBody = sanitizeValue(request.body);

    try {
      response.setHeader?.('x-request-id', requestId);
    } catch {
      // Setting a header must never break the request.
    }

    return next.handle().pipe(
      map((data: unknown) => {
        this.persist({
          requestId,
          moduleName,
          method,
          path,
          statusCode: response.statusCode ?? (method === 'POST' ? 201 : 200),
          requestHeaders: requestHeaders as Prisma.InputJsonValue | null,
          requestBody: requestBody as Prisma.InputJsonValue | null,
          responseBody: sanitizeValue(data) as Prisma.InputJsonValue | null,
          ip,
          userId,
          createdBy,
          durationMs: Date.now() - startedAt,
          error: null,
        });
        return data;
      }),
      catchError((error: unknown) => {
        const { statusCode, errorInfo, responseBody } = this.toErrorInfo(error);
        this.persist({
          requestId,
          moduleName,
          method,
          path,
          statusCode,
          requestHeaders: requestHeaders as Prisma.InputJsonValue | null,
          requestBody: requestBody as Prisma.InputJsonValue | null,
          responseBody: responseBody as Prisma.InputJsonValue | null,
          ip,
          userId,
          createdBy,
          durationMs: Date.now() - startedAt,
          error: errorInfo as Prisma.InputJsonValue | null,
        });
        return throwError(() => error);
      }),
    );
  }

  private persist(input: CreateApplicationLogInput): void {
    // Fire-and-forget: a failing log write must never affect the request.
    void this.applicationLogService.create(input).catch(() => undefined);
  }

  private resolveRequestId(request: LoggableRequest): string {
    const header = request.headers?.['x-request-id'];
    if (typeof header === 'string' && header.trim().length > 0) {
      return header.trim();
    }
    return randomUUID();
  }

  private resolveModuleName(controllerName?: string): string {
    if (!controllerName) {
      return 'unknown';
    }
    const name = controllerName.replace(/Controller$/i, '');
    if (!name) {
      return 'unknown';
    }
    return name.charAt(0).toLowerCase() + name.slice(1);
  }

  private resolveClientIp(request: LoggableRequest): string | null {
    const forwarded = request.headers?.['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.length > 0) {
      return forwarded.split(',')[0].trim() || null;
    }
    if (Array.isArray(forwarded) && forwarded.length > 0) {
      const first = `${forwarded[0]}`.split(',')[0]?.trim();
      if (first) {
        return first;
      }
    }
    if (typeof request.ip === 'string') {
      return request.ip;
    }
    const socketIp = request.socket?.remoteAddress;
    if (typeof socketIp === 'string') {
      return socketIp;
    }
    const connectionIp = request.connection?.remoteAddress;
    if (typeof connectionIp === 'string') {
      return connectionIp;
    }
    return null;
  }

  private resolveUserId(user?: UserLike): string | null {
    if (!user) {
      return null;
    }
    const id = user.currentUserId ?? user.userId;
    if (id === undefined || id === null) {
      return null;
    }
    return `${id as string | number}`;
  }

  /**
   * Resolves the internal numeric user id for the `createdBy` audit column.
   * This mirrors `@CurrentUser('userId')`, which other modules persist into
   * their `createdBy` columns.
   */
  private resolveCreatedBy(user?: UserLike): number | null {
    if (!user) {
      return null;
    }
    const id = user.userId;
    if (typeof id === 'number' && Number.isInteger(id)) {
      return id;
    }
    if (typeof id === 'string' && id.trim().length > 0) {
      const parsed = Number(id);
      return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
    }
    return null;
  }

  private requestHeadersToRecord(
    headers: Record<string, unknown> | undefined,
  ): Record<string, unknown> {
    const record: Record<string, unknown> = {};
    if (!headers) {
      return record;
    }
    for (const [key, value] of Object.entries(headers)) {
      record[key] = Array.isArray(value) ? value.join(', ') : value;
    }
    return record;
  }

  private toErrorInfo(error: unknown): {
    statusCode: number;
    errorInfo: unknown;
    responseBody: unknown;
  } {
    if (error instanceof HttpException) {
      const statusCode = error.getStatus();
      const rawResponse = error.getResponse();
      // `getResponse()` is exactly what Nest's exception filter serializes to
      // the client; when it is a bare string, the filter wraps it into an
      // object with the status code.
      const responseBody =
        typeof rawResponse === 'object' && rawResponse !== null
          ? rawResponse
          : { statusCode, message: rawResponse };
      return {
        statusCode,
        errorInfo: sanitizeValue({
          name: error.name,
          message: error.message,
          statusCode,
          response: rawResponse,
        }),
        responseBody: sanitizeValue(responseBody),
      };
    }

    const fallback = error instanceof Error ? error : new Error(String(error));
    return {
      statusCode: 500,
      errorInfo: sanitizeValue({
        name: fallback.name,
        message: fallback.message,
        statusCode: 500,
        stack: fallback.stack ?? null,
      }),
      // Nest's default 500 handler always sends this exact body to the client.
      responseBody: sanitizeValue({
        statusCode: 500,
        message: 'Internal server error',
      }),
    };
  }
}
