import { describe, it, expect } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import {
  encodeCursor,
  decodeCursor,
  encodeGenericCursor,
  decodeGenericCursor,
} from './cursor.util.js';

describe('Cursor Utilities (Common Pagination)', () => {
  it('encodes and decodes legacy createdAt cursors', () => {
    const now = new Date();
    const id = '123e4567-e89b-12d3-a456-426614174000';
    const encoded = encodeCursor({ createdAt: now, id });
    const decoded = decodeCursor(encoded);

    expect(decoded.id).toBe(id);
    expect(decoded.createdAt.toISOString()).toBe(now.toISOString());
  });

  it('rejects invalid legacy cursor structure', () => {
    expect(() => decodeCursor('invalid-base64')).toThrow(BadRequestException);
    const badJson = Buffer.from(JSON.stringify({ notId: 1 }), 'utf-8').toString('base64url');
    expect(() => decodeCursor(badJson)).toThrow(BadRequestException);
  });

  it('encodes and decodes generic date cursor', () => {
    const now = new Date();
    const id = 'task-1';
    const encoded = encodeGenericCursor({ key: now, id, signature: 'sort=createdAt' });
    const decoded = decodeGenericCursor(encoded, 'sort=createdAt');

    expect(decoded.type).toBe('date');
    expect(decoded.key).toBe(now.toISOString());
    expect(decoded.id).toBe(id);
    expect(decoded.signature).toBe('sort=createdAt');
  });

  it('encodes and decodes generic string cursor', () => {
    const encoded = encodeGenericCursor({ key: 'a0', id: 'task-pos-1' });
    const decoded = decodeGenericCursor(encoded);

    expect(decoded.type).toBe('string');
    expect(decoded.key).toBe('a0');
    expect(decoded.id).toBe('task-pos-1');
  });

  it('encodes and decodes null key cursor (e.g. dueDate nulls)', () => {
    const encoded = encodeGenericCursor({ key: null, id: 'task-no-date' });
    const decoded = decodeGenericCursor(encoded);

    expect(decoded.type).toBe('null');
    expect(decoded.key).toBeNull();
    expect(decoded.id).toBe('task-no-date');
  });

  it('rejects cursor when signature does not match', () => {
    const encoded = encodeGenericCursor({
      key: 'val',
      id: 'task-1',
      signature: 'sort=priority:desc&status=OPEN',
    });

    expect(() =>
      decodeGenericCursor(encoded, 'sort=dueDate:asc&status=OPEN'),
    ).toThrow(BadRequestException);
  });
});
