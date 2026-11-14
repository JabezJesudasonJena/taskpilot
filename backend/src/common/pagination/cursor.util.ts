import { BadRequestException } from '@nestjs/common';

export interface CursorPayload {
  createdAt: Date;
  id: string;
}

export function encodeCursor(payload: { createdAt: Date; id: string }): string {
  const json = JSON.stringify({
    createdAt: payload.createdAt.toISOString(),
    id: payload.id,
  });
  return Buffer.from(json, 'utf-8').toString('base64url');
}

export function decodeCursor(cursor: string): { createdAt: Date; id: string } {
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf-8');
    const parsed = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      typeof parsed.id !== 'string' ||
      !parsed.id ||
      typeof parsed.createdAt !== 'string' ||
      !parsed.createdAt
    ) {
      throw new Error('Invalid cursor structure');
    }
    const createdAt = new Date(parsed.createdAt);
    if (Number.isNaN(createdAt.getTime())) {
      throw new Error('Invalid cursor date');
    }
    return { createdAt, id: parsed.id };
  } catch {
    throw new BadRequestException('Invalid cursor');
  }
}
