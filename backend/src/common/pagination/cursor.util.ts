import { BadRequestException } from '@nestjs/common';

export type CursorKeyType = 'string' | 'number' | 'date' | 'null';

export interface CursorPayload {
  createdAt: Date;
  id: string;
}

export interface GenericCursorPayload {
  t: CursorKeyType;
  k: string | number | null;
  id: string;
  f?: string;
}

export interface GenericCursor {
  type: CursorKeyType;
  key: string | number | null;
  id: string;
  signature?: string;
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
    if (!parsed || typeof parsed !== 'object' || typeof parsed.id !== 'string' || !parsed.id) {
      throw new Error('Invalid cursor structure');
    }

    if (parsed.createdAt) {
      const createdAt = new Date(parsed.createdAt);
      if (Number.isNaN(createdAt.getTime())) {
        throw new Error('Invalid cursor date');
      }
      return { createdAt, id: parsed.id };
    }

    if (parsed.t === 'date' && typeof parsed.k === 'string') {
      const createdAt = new Date(parsed.k);
      if (Number.isNaN(createdAt.getTime())) {
        throw new Error('Invalid cursor date');
      }
      return { createdAt, id: parsed.id };
    }

    throw new Error('Invalid cursor structure');
  } catch {
    throw new BadRequestException('Invalid cursor');
  }
}

export function encodeGenericCursor(payload: {
  key: string | number | Date | null;
  id: string;
  signature?: string;
}): string {
  let t: CursorKeyType;
  let k: string | number | null;

  if (payload.key === null || payload.key === undefined) {
    t = 'null';
    k = null;
  } else if (payload.key instanceof Date) {
    t = 'date';
    k = payload.key.toISOString();
  } else if (typeof payload.key === 'number') {
    t = 'number';
    k = payload.key;
  } else {
    t = 'string';
    k = String(payload.key);
  }

  const obj: GenericCursorPayload = {
    t,
    k,
    id: payload.id,
    ...(payload.signature ? { f: payload.signature } : {}),
  };

  return Buffer.from(JSON.stringify(obj), 'utf-8').toString('base64url');
}

export function decodeGenericCursor(
  cursor: string,
  expectedSignature?: string,
): GenericCursor {
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf-8');
    const parsed = JSON.parse(raw);

    if (!parsed || typeof parsed !== 'object' || typeof parsed.id !== 'string' || !parsed.id) {
      throw new BadRequestException('Invalid cursor structure');
    }

    // Check filter/sort signature mismatch if expected
    if (expectedSignature && parsed.f && parsed.f !== expectedSignature) {
      throw new BadRequestException('Cursor signature does not match current query parameters');
    }

    // Handle legacy { createdAt, id }
    if (parsed.createdAt) {
      const d = new Date(parsed.createdAt);
      if (Number.isNaN(d.getTime())) {
        throw new BadRequestException('Invalid cursor date');
      }
      return {
        type: 'date',
        key: d.toISOString(),
        id: parsed.id,
      };
    }

    if (!parsed.t || !['string', 'number', 'date', 'null'].includes(parsed.t)) {
      throw new BadRequestException('Invalid cursor type tag');
    }

    let key: string | number | null;
    if (parsed.t === 'null') {
      key = null;
    } else if (parsed.t === 'number') {
      if (typeof parsed.k !== 'number' || Number.isNaN(parsed.k)) {
        throw new BadRequestException('Invalid numeric cursor key');
      }
      key = parsed.k;
    } else if (parsed.t === 'date') {
      if (typeof parsed.k !== 'string') {
        throw new BadRequestException('Invalid date cursor key');
      }
      const d = new Date(parsed.k);
      if (Number.isNaN(d.getTime())) {
        throw new BadRequestException('Invalid date cursor key');
      }
      key = d.toISOString();
    } else {
      if (typeof parsed.k !== 'string') {
        throw new BadRequestException('Invalid string cursor key');
      }
      key = parsed.k;
    }

    return {
      type: parsed.t,
      key,
      id: parsed.id,
      signature: parsed.f,
    };
  } catch (err) {
    if (err instanceof BadRequestException) {
      throw err;
    }
    throw new BadRequestException('Invalid cursor');
  }
}
