import {
  CIRCULAR_REFERENCE,
  MAX_DEPTH_REACHED,
  REDACTED,
  sanitizeValue,
  isSensitiveKey,
} from './sanitize';

describe('sanitizeValue', () => {
  it('leaves plain JSON values untouched', () => {
    const input = { id: 1, name: 'Tomato', active: true, tags: ['a', 'b'] };
    expect(sanitizeValue(input)).toEqual(input);
  });

  it('redacts sensitive keys recursively', () => {
    const input = {
      email: 'admin@example.com',
      password: 'supersecret',
      profile: {
        access_token: 'abc123',
        apiKey: 'key-123',
      },
      headers: {
        authorization: 'Bearer abc',
        cookie: 'token=xyz',
        'x-api-key': 'k',
      },
    };

    expect(sanitizeValue(input)).toEqual({
      email: 'admin@example.com',
      password: REDACTED,
      profile: {
        access_token: REDACTED,
        apiKey: REDACTED,
      },
      headers: {
        authorization: REDACTED,
        cookie: REDACTED,
        'x-api-key': REDACTED,
      },
    });
  });

  it('redacts camelCase and tableToken-style keys via boundary matching', () => {
    expect(sanitizeValue({ tableToken: 'abc' })).toEqual({
      tableToken: REDACTED,
    });
    expect(sanitizeValue({ clientSecret: 'abc' })).toEqual({
      clientSecret: REDACTED,
    });
    expect(sanitizeValue({ otp: '123456' })).toEqual({ otp: REDACTED });
  });

  it('does not redact innocent keys', () => {
    const input = { spinning: 'ok', main: 'ok', status: 'ok', message: 'ok' };
    expect(sanitizeValue(input)).toEqual(input);
  });

  it('handles undefined and null as null', () => {
    expect(sanitizeValue(undefined)).toBeNull();
    expect(sanitizeValue(null)).toBeNull();
    expect(sanitizeValue({ a: undefined, b: null })).toEqual({
      a: null,
      b: null,
    });
  });

  it('resolves circular references instead of throwing', () => {
    const circular: Record<string, any> = { name: 'loop' };
    circular.self = circular;
    const result = sanitizeValue(circular) as Record<string, any>;
    expect(result.self).toBe(CIRCULAR_REFERENCE);
  });

  it('summarizes multer file objects without binary payloads', () => {
    const buffer = Buffer.from('binary-content');
    const file = {
      fieldname: 'imageFile',
      originalname: 'photo.png',
      encoding: '7bit',
      mimetype: 'image/png',
      size: 100,
      buffer,
    };
    const result = sanitizeValue(file) as Record<string, any>;
    expect(result).not.toHaveProperty('buffer');
    expect(result).toMatchObject({
      fieldname: 'imageFile',
      originalname: 'photo.png',
      mimetype: 'image/png',
      size: 100,
    });
    expect(result.buffer).toBeUndefined();
  });

  it('summarizes raw buffers as binary marker', () => {
    expect(sanitizeValue(Buffer.from('data'))).toContain('Binary Data');
  });

  it('serializes dates, bigints, functions and symbols', () => {
    const date = new Date('2026-01-01T00:00:00.000Z');
    const result = sanitizeValue({
      date,
      big: 10n,
      fn: () => 1,
      sym: Symbol('s'),
    }) as Record<string, any>;

    expect(result.date).toBe('2026-01-01T00:00:00.000Z');
    expect(result.big).toBe(10);
    expect(result.fn).toBe('[Function: fn]');
    expect(result.sym).toBe('[Symbol: s]');
  });

  it('truncates oversized strings and arrays', () => {
    const longString = 'a'.repeat(50);
    const result = sanitizeValue(
      { text: longString, list: [1, 2, 3, 4, 5] },
      { maxStringLength: 10, maxArrayItems: 3 },
    ) as { text: string; list: unknown[] };

    expect(result.text.length).toBeLessThan(50);
    expect(result.text).toContain('truncated');
    expect(result.list).toHaveLength(4); // 3 items + omitted marker
    expect(result.list[3]).toContain('more items omitted');
  });

  it('respects the depth limit', () => {
    const nested: Record<string, unknown> = {
      a: { b: { c: { d: { e: 1 } } } },
    };
    const result = sanitizeValue(nested, { maxDepth: 2 }) as {
      a: { b: { c: unknown } };
    };
    expect(result.a.b.c).toBe(MAX_DEPTH_REACHED);
  });

  it('normalizes NaN and Infinity to null', () => {
    expect(sanitizeValue({ a: NaN, b: Infinity })).toEqual({
      a: null,
      b: null,
    });
  });

  it('supports extra redact keys', () => {
    const result = sanitizeValue(
      { myCustomThing: 'x' },
      { redactKeys: ['my_custom_thing'] },
    );
    expect(result).toEqual({ myCustomThing: REDACTED });
  });
});

describe('isSensitiveKey', () => {
  it('detects exact, snake_case, kebab-case and camelCase variants', () => {
    expect(isSensitiveKey('password')).toBe(true);
    expect(isSensitiveKey('PASSWORD')).toBe(true);
    expect(isSensitiveKey('access_token')).toBe(true);
    expect(isSensitiveKey('x-api-key')).toBe(true);
    expect(isSensitiveKey('clientSecret')).toBe(true);
    expect(isSensitiveKey('tableToken')).toBe(true);
    expect(isSensitiveKey('name')).toBe(false);
    expect(isSensitiveKey('totalAmount')).toBe(false);
  });
});
