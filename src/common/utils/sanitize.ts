/**
 * Reusable, recursive request/response sanitization used by the application
 * logging interceptor.
 *
 * The output is always JSON-safe so it can be stored in a Prisma `Json`
 * column. It:
 * - redacts sensitive data (passwords, tokens, cookies, api keys, secrets,
 *   OTPs, pins, credentials, ...)
 * - resolves circular references
 * - normalizes non-JSON-serializable values (`undefined`, `NaN`, `Infinity`,
 *   `BigInt`, `Date`, `Buffer`, Prisma `Decimal`, functions, symbols, ...)
 * - summarizes Multer file objects instead of storing binary content
 * - truncates oversized strings / arrays / objects
 */

export const REDACTED = '[REDACTED]';
export const CIRCULAR_REFERENCE = '[Circular Reference]';
export const MAX_DEPTH_REACHED = '[Max Depth Reached]';

export interface SanitizeOptions {
  /** Maximum length of a string value before it is truncated. */
  maxStringLength?: number;
  /** Maximum number of array items kept per array. */
  maxArrayItems?: number;
  /** Maximum number of own keys kept per object. */
  maxObjectKeys?: number;
  /** Maximum nesting depth before the value is replaced. */
  maxDepth?: number;
  /** Extra normalized key names that should always be redacted. */
  redactKeys?: readonly string[];
}

const DEFAULT_OPTIONS = {
  maxStringLength: 10_000,
  maxArrayItems: 100,
  maxObjectKeys: 200,
  maxDepth: 12,
} as const;

/** Normalized key names considered sensitive (snake_case or camelCase). */
const DEFAULT_SENSITIVE_TOKENS: readonly string[] = [
  'password',
  'passwd',
  'pwd',
  'token',
  'auth_token',
  'access_token',
  'refresh_token',
  'authorization',
  'proxy_authorization',
  'cookie',
  'set_cookie',
  'api_key',
  'apikey',
  'secret',
  'client_secret',
  'otp',
  'pin',
  'credential',
  'credentials',
  'jwt',
  'csrf',
];

export function isSensitiveKey(
  key: string,
  extraKeys: readonly string[] = [],
): boolean {
  const normalized = normalizeKey(key);
  const tokens = [...DEFAULT_SENSITIVE_TOKENS, ...extraKeys];

  return tokens.some((rawToken) => {
    const token = normalizeKey(rawToken);
    if (!token) {
      return false;
    }
    if (normalized === token) {
      return true;
    }
    // Boundary-aware containment on normalized keys so `access_token`,
    // `x_api_key`, `client_secret`, `table_token`, ... are all redacted.
    return (
      normalized.startsWith(`${token}_`) ||
      normalized.endsWith(`_${token}`) ||
      normalized.includes(`_${token}_`)
    );
  });
}

function normalizeKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2') // camelCase -> snake_case
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function sanitizeValue(
  value: unknown,
  options: SanitizeOptions = {},
): unknown {
  const opts: Required<SanitizeOptions> = {
    maxStringLength: options.maxStringLength ?? DEFAULT_OPTIONS.maxStringLength,
    maxArrayItems: options.maxArrayItems ?? DEFAULT_OPTIONS.maxArrayItems,
    maxObjectKeys: options.maxObjectKeys ?? DEFAULT_OPTIONS.maxObjectKeys,
    maxDepth: options.maxDepth ?? DEFAULT_OPTIONS.maxDepth,
    redactKeys: options.redactKeys ?? [],
  };

  return sanitizeInternal(value, 0, new WeakSet<object>(), opts);
}

function sanitizeInternal(
  value: unknown,
  depth: number,
  seen: WeakSet<object>,
  options: Required<SanitizeOptions>,
): unknown {
  if (value === null || value === undefined) {
    return null;
  }

  if (depth > options.maxDepth) {
    return MAX_DEPTH_REACHED;
  }

  if (typeof value === 'string') {
    return truncateString(value, options.maxStringLength);
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'bigint') {
    return isSafeBigInt(value) ? Number(value) : value.toString(10);
  }
  if (typeof value === 'symbol') {
    return value.description ? `[Symbol: ${value.description}]` : '[Symbol]';
  }
  if (typeof value === 'function') {
    return `[Function: ${value.name || 'anonymous'}]`;
  }

  const obj = value as object;
  if (seen.has(obj)) {
    return CIRCULAR_REFERENCE;
  }
  seen.add(obj);

  if (Buffer.isBuffer(obj)) {
    return `[Binary Data: ${obj.length} bytes]`;
  }
  if (ArrayBuffer.isView(obj) || obj instanceof ArrayBuffer) {
    return `[Binary Data: ${obj.byteLength} bytes]`;
  }
  if (obj instanceof Date) {
    const time = obj.getTime();
    return Number.isNaN(time) ? null : obj.toISOString();
  }
  if (obj instanceof Error) {
    return { name: obj.name, message: obj.message };
  }
  if (
    obj.constructor?.name === 'Decimal' &&
    typeof (obj as { toNumber?: unknown }).toNumber === 'function'
  ) {
    const decimal = obj as { toNumber: () => number };
    const number = decimal.toNumber();
    return Number.isFinite(number) ? number : number.toString();
  }
  if (isFileLikeObject(obj)) {
    return summarizeFile(obj);
  }

  try {
    // Serialize JSON-aware objects the way JSON.stringify would.
    const toJson = (value as Record<string, unknown>).toJSON;
    if (typeof toJson === 'function') {
      const toJsonFn = toJson as () => unknown;
      const serialized: unknown = toJsonFn.call(value);
      return sanitizeInternal(serialized, depth + 1, seen, options);
    }
  } catch {
    // Fall through to generic object handling.
  }

  if (Array.isArray(obj)) {
    const items = obj.slice(0, options.maxArrayItems);
    const sanitizedItems = items.map((item) =>
      sanitizeInternal(item, depth + 1, seen, options),
    );
    if (obj.length > options.maxArrayItems) {
      sanitizedItems.push(
        `[${obj.length - options.maxArrayItems} more items omitted]`,
      );
    }
    return sanitizedItems;
  }

  const keys = Object.keys(obj);
  const result: Record<string, unknown> = {};

  for (const key of keys.slice(0, options.maxObjectKeys)) {
    if (isSensitiveKey(key, options.redactKeys)) {
      result[key] = REDACTED;
      continue;
    }
    result[key] = sanitizeInternal(
      readProperty(obj, key),
      depth + 1,
      seen,
      options,
    );
  }

  if (keys.length > options.maxObjectKeys) {
    result['[omitted]'] =
      `${keys.length - options.maxObjectKeys} more keys omitted`;
  }

  return result;
}

function readProperty(obj: object, key: string): unknown {
  try {
    return (obj as Record<string, unknown>)[key];
  } catch {
    return '[Unreadable Property]';
  }
}

function truncateString(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength)}...[${value.length - maxLength} chars truncated]`;
}

function isSafeBigInt(value: bigint): boolean {
  return (
    value <= BigInt(Number.MAX_SAFE_INTEGER) &&
    value >= BigInt(Number.MIN_SAFE_INTEGER)
  );
}

function isFileLikeObject(value: object): boolean {
  const file = value as Record<string, unknown>;
  const hasPayload = file.buffer !== undefined || file.stream !== undefined;
  const hasMeta =
    (file.originalname !== undefined || file.filename !== undefined) &&
    file.size !== undefined &&
    file.mimetype !== undefined;
  return hasPayload && hasMeta;
}

function summarizeFile(file: object): Record<string, unknown> {
  const fileRecord = file as Record<string, unknown>;
  const summary: Record<string, unknown> = {};
  for (const key of [
    'fieldname',
    'originalname',
    'filename',
    'encoding',
    'mimetype',
    'size',
    'path',
  ]) {
    if (fileRecord[key] !== undefined) {
      summary[key] = fileRecord[key];
    }
  }
  return summary;
}
