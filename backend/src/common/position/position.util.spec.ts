import { describe, it, expect } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { positionBetween } from './position.util.js';

describe('position.util (Unit)', () => {
  it('generates a valid initial key when prev and next are null', () => {
    const pos = positionBetween(null, null);
    expect(typeof pos).toBe('string');
    expect(pos.length).toBeGreaterThan(0);
  });

  it('generates a key strictly greater than prev when next is null (append)', () => {
    const prev = 'a0';
    const nextPos = positionBetween(prev, null);
    expect(nextPos > prev).toBe(true);
  });

  it('generates a key strictly less than next when prev is null (prepend)', () => {
    const next = 'a0';
    const prevPos = positionBetween(null, next);
    expect(prevPos < next).toBe(true);
  });

  it('generates a key strictly between prev and next', () => {
    const prev = 'a0';
    const next = 'a1';
    const mid = positionBetween(prev, next);
    expect(mid > prev).toBe(true);
    expect(mid < next).toBe(true);
  });

  it('throws BadRequestException when prev >= next', () => {
    expect(() => positionBetween('a1', 'a0')).toThrow(BadRequestException);
    expect(() => positionBetween('a0', 'a0')).toThrow(BadRequestException);
    expect(() => positionBetween('b', 'a')).toThrow(BadRequestException);
  });

  it('handles multiple consecutive insertions preserving sorted order', () => {
    let current: string | null = null;
    const positions: string[] = [];

    for (let i = 0; i < 10; i++) {
      current = positionBetween(current, null);
      positions.push(current);
    }

    const sorted = [...positions].sort();
    expect(positions).toEqual(sorted);
  });
});
