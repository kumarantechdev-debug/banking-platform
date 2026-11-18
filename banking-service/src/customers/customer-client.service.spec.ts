import { status } from '@grpc/grpc-js';
import { RpcException } from '@nestjs/microservices';
import type { ClientGrpc } from '@nestjs/microservices';
import { jest } from '@jest/globals';
import { of, throwError } from 'rxjs';
import { CustomerClientService } from './customer-client.service';

function createService() {
  const customerService = {
    getCustomer: jest.fn(),
  };
  const grpcClient = {
    getService: jest.fn(() => customerService),
  } as unknown as ClientGrpc;
  const service = new CustomerClientService(grpcClient);
  service.onModuleInit();

  return { service, customerService };
}

async function expectRpcCode(
  operation: Promise<unknown>,
  code: number,
): Promise<void> {
  const error = await operation.then(
    () => undefined,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(RpcException);
  if (!(error instanceof RpcException)) {
    throw error;
  }
  expect(error.getError()).toMatchObject({ code });
}

describe('CustomerClientService', () => {
  it('calls GetCustomer and accepts the matching customer', async () => {
    const context = createService();
    context.customerService.getCustomer.mockReturnValue(of({ id: 7 }));

    await expect(
      context.service.assertCustomerExists(7),
    ).resolves.toBeUndefined();
    expect(context.customerService.getCustomer).toHaveBeenCalledWith({ id: 7 });
  });

  it('maps a missing customer to NOT_FOUND', async () => {
    const context = createService();
    const error = Object.assign(new Error('not found'), {
      code: status.NOT_FOUND,
    });
    context.customerService.getCustomer.mockReturnValue(
      throwError(() => error),
    );

    await expectRpcCode(
      context.service.assertCustomerExists(7),
      status.NOT_FOUND,
    );
  });

  it('maps an unavailable Customer Service to UNAVAILABLE', async () => {
    const context = createService();
    const error = Object.assign(new Error('unavailable'), {
      code: status.UNAVAILABLE,
    });
    context.customerService.getCustomer.mockReturnValue(
      throwError(() => error),
    );

    await expectRpcCode(
      context.service.assertCustomerExists(7),
      status.UNAVAILABLE,
    );
  });

  it('treats a mismatched customer response as NOT_FOUND', async () => {
    const context = createService();
    context.customerService.getCustomer.mockReturnValue(of({ id: 8 }));

    await expectRpcCode(
      context.service.assertCustomerExists(7),
      status.NOT_FOUND,
    );
  });
});
