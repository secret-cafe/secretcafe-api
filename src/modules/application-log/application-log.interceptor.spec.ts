import {
  BadRequestException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { lastValueFrom, of, throwError } from 'rxjs';
import { REDACTED } from 'src/common/utils/sanitize';
import { ApplicationLogInterceptor } from './application-log.interceptor';
import { ApplicationLogService } from './application-log.service';

interface PersistedLog {
  requestId: string;
  moduleName: string;
  method: string;
  path: string;
  statusCode: number;
  requestHeaders: Record<string, unknown>;
  requestBody: Record<string, unknown>;
  responseBody: unknown;
  ip: string | null;
  userId: string | null;
  createdBy: number | null;
  durationMs: number;
  error: Record<string, unknown> | null;
}

class DummyController {}

describe('ApplicationLogInterceptor', () => {
  let interceptor: ApplicationLogInterceptor;
  let service: { create: jest.Mock };

  beforeEach(() => {
    service = { create: jest.fn().mockResolvedValue(undefined) };
    interceptor = new ApplicationLogInterceptor(
      service as unknown as ApplicationLogService,
    );
  });

  const createRequest = (overrides: Record<string, any> = {}) => ({
    method: 'POST',
    originalUrl: '/api/v1/auth/login',
    headers: {},
    body: { email: 'admin@example.com' },
    user: undefined,
    ip: undefined,
    socket: {},
    ...overrides,
  });

  const createResponse = (statusCode = 201) => ({
    statusCode,
    setHeader: jest.fn(),
  });

  const buildHttpContext = (
    request: unknown,
    response: unknown,
    handlerClass = DummyController,
  ) =>
    ({
      getType: () => 'http',
      getClass: () => handlerClass,
      getHandler: () => jest.fn(),
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    }) as never;

  const getPersistedLog = (): PersistedLog => {
    const calls = service.create.mock.calls as PersistedLog[][];
    return calls[0][0];
  };

  it('skips GET requests without creating a log', async () => {
    const request = createRequest({ method: 'GET' });
    const handler = { handle: () => of({ status: true }) };

    const result = await lastValueFrom(
      interceptor.intercept(
        buildHttpContext(request, createResponse(200)),
        handler,
      ),
    );

    expect(result).toEqual({ status: true });
    expect(service.create).not.toHaveBeenCalled();
  });

  it('passes non-http contexts through untouched', async () => {
    const context = {
      getType: () => 'rpc',
      switchToHttp: () => {
        throw new Error('should not be reached');
      },
    };
    const handler = { handle: () => of('result') };

    const result = await lastValueFrom(
      interceptor.intercept(context as never, handler),
    );

    expect(result).toBe('result');
    expect(service.create).not.toHaveBeenCalled();
  });

  it('captures request/response info for successful non-GET requests', async () => {
    const request = createRequest({
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer secret',
        cookie: 'token=abcd',
        'x-request-id': 'incoming-req-id',
      },
      body: { email: 'a@b.c', password: 'hunter2' },
      user: { currentUserId: 'uu-123', userId: 7 },
      ip: '10.0.0.1',
    });
    const response = createResponse(201);
    const payload = { status: true, message: 'OK' };
    const handler = { handle: () => of(payload) };

    const result = await lastValueFrom(
      interceptor.intercept(buildHttpContext(request, response), handler),
    );

    expect(result).toBe(payload);
    expect(response.setHeader).toHaveBeenCalledWith(
      'x-request-id',
      'incoming-req-id',
    );

    const log = getPersistedLog();
    expect(log.requestId).toBe('incoming-req-id');
    expect(log.moduleName).toBe('dummy');
    expect(log.method).toBe('POST');
    expect(log.path).toBe('/api/v1/auth/login');
    expect(log.statusCode).toBe(201);
    expect(log.userId).toBe('uu-123');
    expect(log.createdBy).toBe(7);
    expect(log.ip).toBe('10.0.0.1');
    expect(log.responseBody).toEqual(payload);
    expect(log.requestBody).toEqual({
      email: 'a@b.c',
      password: REDACTED,
    });
    expect(log.requestHeaders.authorization).toBe(REDACTED);
    expect(log.requestHeaders.cookie).toBe(REDACTED);
    expect(log.error).toBeNull();
    expect(typeof log.durationMs).toBe('number');
  });

  it('generates a unique requestId when no header is provided and echoes it back', async () => {
    const request = createRequest();
    const response = createResponse();
    const handler = { handle: () => of({ ok: true }) };

    await lastValueFrom(
      interceptor.intercept(buildHttpContext(request, response), handler),
    );

    const log = getPersistedLog();
    expect(log.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      'x-request-id',
      log.requestId,
    );
  });

  it('stores null userId and createdBy for unauthenticated requests', async () => {
    const request = createRequest({ user: undefined });
    const handler = { handle: () => of({ ok: true }) };

    await lastValueFrom(
      interceptor.intercept(
        buildHttpContext(request, createResponse()),
        handler,
      ),
    );

    const log = getPersistedLog();
    expect(log.userId).toBeNull();
    expect(log.createdBy).toBeNull();
  });

  it('logs failed requests with the exception status and rethrows', async () => {
    const request = createRequest({ body: {} });
    const handler = {
      handle: () =>
        throwError(
          () =>
            new NotFoundException({
              status: false,
              message: 'Resource gone',
            }),
        ),
    };

    await expect(
      lastValueFrom(
        interceptor.intercept(
          buildHttpContext(request, createResponse(200)),
          handler,
        ),
      ),
    ).rejects.toThrow(NotFoundException);

    const log = getPersistedLog();
    expect(log.statusCode).toBe(404);
    expect(log.responseBody).toEqual({
      status: false,
      message: 'Resource gone',
    });
    const error = log.error as Record<string, unknown>;
    expect(error.name).toBe('NotFoundException');
    expect(error.message).toBe('Resource gone');
    expect(error.statusCode).toBe(404);
  });

  it('captures the validation/Pipe body for BadRequestException', async () => {
    const handler = {
      handle: () =>
        throwError(
          () =>
            new BadRequestException([
              'email must be an email',
              'password must be longer than or equal to 6 characters',
            ]),
        ),
    };

    await expect(
      lastValueFrom(
        interceptor.intercept(
          buildHttpContext(createRequest(), createResponse(200)),
          handler,
        ),
      ),
    ).rejects.toThrow(BadRequestException);

    const log = getPersistedLog();
    expect(log.statusCode).toBe(400);
    expect(log.responseBody).toEqual({
      statusCode: 400,
      message: [
        'email must be an email',
        'password must be longer than or equal to 6 characters',
      ],
      error: 'Bad Request',
    });
  });

  it('wraps a raw string HttpException body into a JSON object', async () => {
    const handler = {
      handle: () => throwError(() => new HttpException('just a message', 418)),
    };

    await expect(
      lastValueFrom(
        interceptor.intercept(
          buildHttpContext(createRequest(), createResponse(200)),
          handler,
        ),
      ),
    ).rejects.toThrow(HttpException);

    const log = getPersistedLog();
    expect(log.statusCode).toBe(418);
    expect(log.responseBody).toEqual({
      statusCode: 418,
      message: 'just a message',
    });
  });

  it('logs unexpected errors as 500 with stack information', async () => {
    const handler = { handle: () => throwError(() => new Error('boom')) };

    await expect(
      lastValueFrom(
        interceptor.intercept(
          buildHttpContext(createRequest(), createResponse()),
          handler,
        ),
      ),
    ).rejects.toThrow('boom');

    const log = getPersistedLog();
    expect(log.statusCode).toBe(500);
    expect(log.responseBody).toEqual({
      statusCode: 500,
      message: 'Internal server error',
    });
    const error = log.error as Record<string, unknown>;
    expect(error.name).toBe('Error');
    expect(error.message).toBe('boom');
    expect(error.stack).toBeDefined();
  });

  it('never breaks the request when persisting the log fails', async () => {
    service.create.mockRejectedValue(new Error('log db down'));
    const handler = { handle: () => of({ ok: true }) };

    const result = await lastValueFrom(
      interceptor.intercept(
        buildHttpContext(createRequest(), createResponse()),
        handler,
      ),
    );

    expect(result).toEqual({ ok: true });
  });
});
