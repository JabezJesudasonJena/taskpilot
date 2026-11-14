import { BadRequestException } from '@nestjs/common';
import { generateKeyBetween } from 'fractional-indexing';

export const SIBLING_ORDER_BY = [
  { position: 'asc' as const },
  { id: 'asc' as const },
];

export function positionBetween(
  prev: string | null | undefined,
  next: string | null | undefined,
): string {
  const p = prev ?? null;
  const n = next ?? null;

  if (p !== null && n !== null) {
    if (p >= n) {
      throw new BadRequestException(
        'Invalid position bounds: prev must be strictly less than next',
      );
    }
  }

  try {
    return generateKeyBetween(p, n);
  } catch (error: any) {
    throw new BadRequestException(
      error?.message || 'Failed to compute fractional position between bounds',
    );
  }
}
