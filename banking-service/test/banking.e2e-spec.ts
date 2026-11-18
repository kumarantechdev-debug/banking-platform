import { randomInt } from 'node:crypto';
import { resolve } from 'node:path';
import { INestMicroservice } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { jest } from '@jest/globals';
import { ClientGrpc, ClientsModule, Transport } from '@nestjs/microservices';
import { firstValueFrom, Observable } from 'rxjs';
import { AccountsController } from '../src/accounts/accounts.controller';
import { AccountsService } from '../src/accounts/accounts.service';
import { Account, AccountStatus } from '../src/accounts/account.entity';
import { Transfer, TransferStatus } from '../src/transfers/transfer.entity';
import { TransfersController } from '../src/transfers/transfers.controller';
import { TransfersService } from '../src/transfers/transfers.service';
import { AccountTransactionHistoryService } from '../src/transfers/account-transaction-history.service';

interface BankingGrpcClient {
  getAccount(request: { accountId: number }): Observable<{
    id: number;
    accountNumber: string;
    customerId: number;
    balance: string;
    status: string;
    createdAt: string;
  }>;
  getTransfer(request: { transferId: number }): Observable<{
    id: number;
    fromAccountId: number;
    toAccountId: number;
    amount: string;
    status: string;
    referenceNumber: string;
    createdAt: string;
  }>;
  getPendingTransfers(request: {
    batchSize: number;
    status: string;
    afterTransferId: number;
  }): Observable<{
    transfers: Array<{
      transferId: number;
      amount: string;
      settlementStatus: string;
      transferStatus: string;
    }>;
    nextAfterTransferId: number;
  }>;
  updateTransferSettlementStatus(request: {
    transferId: number;
    settlementStatus: string;
  }): Observable<{ success: boolean; message: string }>;
}

describe('BankingService gRPC (e2e)', () => {
  let app: INestMicroservice | undefined;
  let moduleFixture: TestingModule | undefined;
  let banking: BankingGrpcClient;

  beforeAll(async () => {
    const port = randomInt(20_000, 60_000);
    const options = {
      package: 'banking',
      protoPath: resolve(process.cwd(), 'proto', 'banking.proto'),
      url: `127.0.0.1:${port}`,
      loader: {
        keepCase: false,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true,
      },
    };
    const accountsService = {
      getAccount: jest.fn().mockResolvedValue(
        Object.assign(new Account(), {
          id: 21,
          accountNumber: 'BA000000000000021',
          customerId: 7,
          balance: '10.05',
          status: AccountStatus.ACTIVE,
          createdAt: new Date('2026-01-02T03:04:05.000Z'),
        }),
      ),
    };
    const transfersService = {
      getTransfer: jest.fn().mockResolvedValue(
        Object.assign(new Transfer(), {
          id: 31,
          fromAccountId: 21,
          toAccountId: 22,
          amount: '1.25',
          status: TransferStatus.SUCCESS,
          referenceNumber: 'TR-test-reference',
          createdAt: new Date('2026-01-02T03:04:05.000Z'),
        }),
      ),
      getPendingTransfers: jest.fn().mockResolvedValue({
        transfers: [
          Object.assign(new Transfer(), {
            id: 31,
            amount: '1.25',
            status: TransferStatus.SUCCESS,
            settlementStatus: 'PENDING',
          }),
        ],
        nextAfterTransferId: 31,
      }),
      updateTransferSettlementStatus: jest.fn().mockResolvedValue({
        success: true,
        message: 'Transfer settlement status updated.',
      }),
    };

    moduleFixture = await Test.createTestingModule({
      imports: [
        ClientsModule.register([
          {
            name: 'BANKING_CLIENT',
            transport: Transport.GRPC,
            options,
          },
        ]),
      ],
      controllers: [AccountsController, TransfersController],
      providers: [
        { provide: AccountsService, useValue: accountsService },
        { provide: TransfersService, useValue: transfersService },
        { provide: AccountTransactionHistoryService, useValue: {} },
      ],
    }).compile();

    app = moduleFixture.createNestMicroservice({
      transport: Transport.GRPC,
      options,
    });
    await app.listen();

    const client = moduleFixture.get<ClientGrpc>('BANKING_CLIENT');
    banking = client.getService<BankingGrpcClient>('BankingService');
  });

  afterAll(async () => {
    await app?.close();
    await moduleFixture?.close();
  });

  it('serves account details through GetAccount', async () => {
    await expect(
      firstValueFrom(banking.getAccount({ accountId: 21 })),
    ).resolves.toMatchObject({
      id: 21,
      balance: '10.05',
      status: 'ACTIVE',
      createdAt: '2026-01-02T03:04:05.000Z',
    });
  });

  it('serves transfer details through GetTransfer', async () => {
    await expect(
      firstValueFrom(banking.getTransfer({ transferId: 31 })),
    ).resolves.toMatchObject({
      id: 31,
      amount: '1.25',
      status: 'SUCCESS',
      referenceNumber: 'TR-test-reference',
    });
  });

  it('serves pending settlement transfers through GetPendingTransfers', async () => {
    await expect(
      firstValueFrom(
        banking.getPendingTransfers({
          batchSize: 100,
          status: 'PENDING',
          afterTransferId: 0,
        }),
      ),
    ).resolves.toMatchObject({
      transfers: [
        {
          transferId: 31,
          amount: '1.25',
          settlementStatus: 'PENDING',
          transferStatus: 'SUCCESS',
        },
      ],
      nextAfterTransferId: 31,
    });
  });

  it('updates settlement status through UpdateTransferSettlementStatus', async () => {
    await expect(
      firstValueFrom(
        banking.updateTransferSettlementStatus({
          transferId: 31,
          settlementStatus: 'SETTLED',
        }),
      ),
    ).resolves.toMatchObject({ success: true });
  });
});
