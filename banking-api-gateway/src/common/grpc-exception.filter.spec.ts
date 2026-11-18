import { jest } from '@jest/globals';
import {
  ArgumentsHost,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { status } from '@grpc/grpc-js';
import { GrpcExceptionFilter } from './grpc-exception.filter.js';

describe('GrpcExceptionFilter', () => {
  function createHost() {
    const response = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const host = {
      switchToHttp: () => ({ getResponse: () => response }),
    } as unknown as ArgumentsHost;
    return { host, response };
  }

  it('maps a gRPC not-found error to a consistent HTTP 404 response', () => {
    const { host, response } = createHost();
    const error = Object.assign(new Error('not found'), {
      code: status.NOT_FOUND,
      details: 'database table customers_private was not found',
    });

    new GrpcExceptionFilter().catch(error, host);

    expect(response.status).toHaveBeenCalledWith(404);
    expect(response.json).toHaveBeenCalledWith({
      statusCode: 404,
      message: 'Resource not found',
    });
  });

  it('maps duplicate gRPC records to HTTP 409 without exposing downstream details', () => {
    const { host, response } = createHost();
    const error = Object.assign(new Error('duplicate customer'), {
      code: status.ALREADY_EXISTS,
      details: 'duplicate record contains private data',
    });

    new GrpcExceptionFilter().catch(error, host);

    expect(response.status).toHaveBeenCalledWith(409);
    expect(response.json).toHaveBeenCalledWith({
      statusCode: 409,
      message: 'Resource already exists',
    });
  });

  it('maps unavailable gRPC services to HTTP 503 with a safe message', () => {
    const { host, response } = createHost();
    const error = Object.assign(new Error('connection failed to db.internal'), {
      code: status.UNAVAILABLE,
      details: 'internal host and port',
    });

    new GrpcExceptionFilter().catch(error, host);

    expect(response.status).toHaveBeenCalledWith(503);
    expect(response.json).toHaveBeenCalledWith({
      statusCode: 503,
      message: 'Downstream service unavailable',
    });
  });

  it('preserves validation messages in a consistent HTTP 400 body', () => {
    const { host, response } = createHost();
    const error = new BadRequestException({
      statusCode: 400,
      error: 'Bad Request',
      message: ['mobile must be a valid phone number'],
    });

    new GrpcExceptionFilter().catch(error, host);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith({
      statusCode: 400,
      message: ['mobile must be a valid phone number'],
    });
  });

  it('does not expose internal HTTP exception messages', () => {
    const { host, response } = createHost();
    const error = new InternalServerErrorException('password=db-secret');

    new GrpcExceptionFilter().catch(error, host);

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({
      statusCode: 500,
      message: 'Internal server error',
    });
  });
});
