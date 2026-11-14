import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let error = 'Internal Server Error';
    let message: string | string[] = 'Internal server error';
    let details: unknown = undefined;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'object' && res !== null) {
        const resObj = res as Record<string, unknown>;
        error =
          (resObj['error'] as string) ||
          exception.name.replace('Exception', '');
        if (Array.isArray(resObj['message'])) {
          message = 'Validation failed';
          details = resObj['message'];
        } else if (typeof resObj['message'] === 'string') {
          message = resObj['message'];
        } else {
          message = exception.message;
        }
        if (resObj['details']) {
          details = resObj['details'];
        }
      } else if (typeof res === 'string') {
        message = res;
        error = exception.name.replace('Exception', '');
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        statusCode = HttpStatus.CONFLICT;
        error = 'Conflict';
        const target = exception.meta?.target;
        const targetStr = Array.isArray(target)
          ? target.join(', ')
          : typeof target === 'string'
            ? target
            : JSON.stringify(target);
        message = target
          ? `Unique constraint failed on: ${targetStr}`
          : 'Resource already exists';
        details = exception.meta;
      } else if (exception.code === 'P2025') {
        statusCode = HttpStatus.NOT_FOUND;
        error = 'Not Found';
        message = (exception.meta?.cause as string) || 'Resource not found';
        details = exception.meta;
      } else {
        statusCode = HttpStatus.BAD_REQUEST;
        error = 'Database Error';
        message = 'A database error occurred';
      }
    }

    const payload: Record<string, unknown> = {
      statusCode,
      error,
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
    };

    if (details !== undefined) {
      payload['details'] = details;
    }

    response.status(statusCode).json(payload);
  }
}
