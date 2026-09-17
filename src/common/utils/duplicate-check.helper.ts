import { throwBadRequestException } from './http-exception.helper';

type PrismaDelegate = {
  findFirst: (args: any) => Promise<{ id: number } | null>;
};

type EnsureUniqueFieldOptions = {
  /** A sibling row to ignore during updates (keyed by its public/internal id column). */
  exclude?: Record<string, { not: string | number }>;
  /** Human-readable label used in the error message. Defaults to `field`. */
  label?: string;
};

export async function ensureUniqueField(
  delegate: PrismaDelegate,
  field: string,
  value: string | undefined | null,
  options: EnsureUniqueFieldOptions = {},
): Promise<void> {
  if (typeof value !== 'string' || value.trim().length === 0) return;

  const existing = await delegate.findFirst({
    where: {
      [field]: value,
      deletedAt: null,
      ...(options.exclude ?? {}),
    },
    select: { id: true },
  });

  if (existing) {
    throwBadRequestException(
      `${options.label ?? field} "${value}" already exists`,
    );
  }
}
