import { ConfigService } from '@nestjs/config';
import { of } from 'rxjs';
import { jest } from '@jest/globals';
import { BankingGrpcClient } from './banking-grpc.client';

describe('BankingGrpcClient', () => {
  it('accepts protobuf responses where an empty repeated transactions field is omitted', async () => {
    const service = {
      getAccountTransactionHistory: jest.fn(() =>
        of({
          openingBalance: '100.00',
          closingBalance: '100.00',
          total: 0,
          totalPages: 0,
          snapshotAt: '2026-04-30 23:59:59.999999',
        }),
      ),
      getAccount: jest.fn(),
    };
    const client = new BankingGrpcClient(new ConfigService());
    Object.assign(client, {
      client: {
        getService: () => service,
      },
    });

    await expect(
      client.getAccountTransactions(8, '2026-04-01', '2026-04-30'),
    ).resolves.toMatchObject({
      transactions: [],
      openingBalance: '100.00',
      closingBalance: '100.00',
      total: 0,
    });

  });

  it('normalizes account opening credits without treating the proto default ID as a transfer ID', async () => {
    const service = {
      getAccountTransactionHistory: jest.fn(() =>
        of({
          transactions: [
            {
              transferId: 0,
              referenceNumber: '',
              transactionDate: '2026-04-02 09:00:00.000000',
              transactionType: 'CREDIT',
              amount: '50.00',
              description: 'Account opening balance',
              isAccountOpening: true,
            },
          ],
          openingBalance: '0.00',
          closingBalance: '50.00',
          total: 1,
          totalPages: 1,
          snapshotAt: '2026-04-30 23:59:59.999999',
        }),
      ),
      getAccount: jest.fn(),
    };
    const client = new BankingGrpcClient(new ConfigService());
    Object.assign(client, {
      client: {
        getService: () => service,
      },
    });

    const history = await client.getAccountTransactions(
      8,
      '2026-04-01',
      '2026-04-30',
    );
    expect(history).toMatchObject({
      openingBalance: '0.00',
      closingBalance: '50.00',
      transactions: [
        {
          isAccountOpening: true,
          transactionType: 'CREDIT',
          amount: '50.00',
        },
      ],
    });
    expect(history.transactions[0].transferId).toBeUndefined();
  });
});
