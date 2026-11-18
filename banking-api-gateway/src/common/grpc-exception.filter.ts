import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { status as grpcStatus } from '@grpc/grpc-js';

interface GrpcServiceError extends Error {
  code: number;
}

interface MappedGrpcError {
  statusCode: number;
  message: string;
}

const GRPC_HTTP_ERRORS = new Map<number, MappedGrpcError>([
  [
    grpcStatus.CANCELLED,
    {
      statusCode: HttpStatus.SERVICE_UNAVAILABLE,
      message: 'Downstream request was cancelled',
    },
  ],
  [
    grpcStatus.INVALID_ARGUMENT,
    { statusCode: HttpStatus.BAD_REQUEST, message: 'Invalid request' },
  ],
  [
    grpcStatus.DEADLINE_EXCEEDED,
    {
      statusCode: HttpStatus.GATEWAY_TIMEOUT,
      message: 'Downstream service timed out',
    },
  ],
  [
    grpcStatus.NOT_FOUND,
    { statusCode: HttpStatus.NOT_FOUND, message: 'Resource not found' },
  ],
  [
    grpcStatus.ALREADY_EXISTS,
    { statusCode: HttpStatus.CONFLICT, message: 'Resource already exists' },
  ],
  [
    grpcStatus.PERMISSION_DENIED,
    { statusCode: HttpStatus.FORBIDDEN, message: 'Forbidden' },
  ],
  [
    grpcStatus.RESOURCE_EXHAUSTED,
    { statusCode: HttpStatus.TOO_MANY_REQUESTS, message: 'Too many requests' },
  ],
  [
    grpcStatus.FAILED_PRECONDITION,
    {
      statusCode: HttpStatus.CONFLICT,
      message: 'Request cannot be completed',
    },
  ],
  [
    grpcStatus.OUT_OF_RANGE,
    { statusCode: HttpStatus.BAD_REQUEST, message: 'Value out of range' },
  ],
  [
    grpcStatus.UNAUTHENTICATED,
    { statusCode: HttpStatus.UNAUTHORIZED, message: 'Unauthorized' },
  ],
  [
    grpcStatus.UNAVAILABLE,
    {
      statusCode: HttpStatus.SERVICE_UNAVAILABLE,
      message: 'Downstream service unavailable',
    },
  ],
]);

@Catch()
export class GrpcExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GrpcExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const message =
        statusCode >= HttpStatus.INTERNAL_SERVER_ERROR
          ? 'Internal server error'
          : getHttpExceptionMessage(exception);
      response.status(statusCode).json({ statusCode, message });
      return;
    }

    if (isGrpcServiceError(exception)) {
      const mappedError = GRPC_HTTP_ERRORS.get(exception.code) ?? {
        statusCode: HttpStatus.BAD_GATEWAY,
        message: 'Downstream service error',
      };
      response.status(mappedError.statusCode).json({
        statusCode: mappedError.statusCode,
        message: mappedError.message,
      });
      return;
    }

    this.logger.error(
      'Unhandled API Gateway exception',
      exception instanceof Error ? exception.stack : String(exception),
    );
    response
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json({ statusCode: HttpStatus.INTERNAL_SERVER_ERROR, message: 'Internal server error' });
  }
}

function getHttpExceptionMessage(exception: HttpException): string | string[] {
  const body = exception.getResponse();
  if (typeof body === 'string') {
    return body;
  }

  if (typeof body === 'object' && body !== null && 'message' in body) {
    const message = body.message;
    if (typeof message === 'string') {
      return message;
    }
    if (
      Array.isArray(message) &&
      message.every((item): item is string => typeof item === 'string')
    ) {
      return message;
    }
  }

  return 'Request failed';
}

function isGrpcServiceError(error: unknown): error is GrpcServiceError {
  return (
    error instanceof Error &&
    'code' in error &&
    typeof error.code === 'number'
  );
}
