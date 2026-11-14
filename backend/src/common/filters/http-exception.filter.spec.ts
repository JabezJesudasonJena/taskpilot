import { describe, it, expect } from 'vitest';
import { HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { HttpExceptionFilter } from './http-exception.filter.js';

describe('HttpExceptionFilter (Unit)', () => {
  const filter = new HttpExceptionFilter();

  function mockHost() {
    let responseStatus: number | null = null;
    let responseJson: any = null;

    const response = {
      status(code: number) {
        responseStatus = code;
        return this;
      },
      json(data: any) {
        responseJson = data;
        return this;
      },
    };

    const request = {
      url: '/test-endpoint',
    };

    const host = {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => request,
      }),
    };

    return { host: host as any, getResult: () => ({ status: responseStatus, body: responseJson }) };
  }

  it('maps Prisma P2003 (foreign key constraint violation) to 409 Conflict', () => {
    const { host, getResult } = mockHost();
    const error = new Prisma.PrismaClientKnownRequestError(
      'Foreign key constraint failed on the field: status_id',
      {
        code: 'P2003',
        clientVersion: '6.19.2',
        meta: { field_name: 'status_id' },
      },
    );

    filter.catch(error, host);
    const result = getResult();

    expect(result.status).toBe(HttpStatus.CONFLICT);
    expect(result.body.error).toBe('Conflict');
    expect(result.body.message).toContain('status_id');
    expect(result.body.statusCode).toBe(409);
  });

  it('maps Prisma P2002 to 409 Conflict', () => {
    const { host, getResult } = mockHost();
    const error = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '6.19.2',
      meta: { target: ['email'] },
    });

    filter.catch(error, host);
    const result = getResult();

    expect(result.status).toBe(HttpStatus.CONFLICT);
    expect(result.body.error).toBe('Conflict');
  });

  it('maps Prisma P2025 to 404 Not Found', () => {
    const { host, getResult } = mockHost();
    const error = new Prisma.PrismaClientKnownRequestError('Record not found', {
      code: 'P2025',
      clientVersion: '6.19.2',
      meta: { cause: 'Record not found' },
    });

    filter.catch(error, host);
    const result = getResult();

    expect(result.status).toBe(HttpStatus.NOT_FOUND);
    expect(result.body.error).toBe('Not Found');
  });
});
