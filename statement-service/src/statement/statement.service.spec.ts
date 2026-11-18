import { BadRequestException } from '@nestjs/common';
import { jest } from '@jest/globals';
import type { Repository } from 'typeorm';
import type { BankingGrpcClient } from '../banking/banking-grpc.client';
import type { Statement } from '../database/entities/statement.entity';
import type { StatementTransaction } from '../database/entities/statement-transaction.entity';
import { StatementCalculationService } from './statement-calculation.service';
import { StatementService } from './statement.service';

function createService() {
  const statementRepository = {
    create: jest.fn((statement: object) => statement),
    save: jest.fn(async (statement: object) => ({ ...statement, id: 12 })),
  };
  const statementTransactionRepository = {
    create: jest.fn((transaction: object) => transaction),
    save: jest.fn(async (transactions: object[]) => transactions),
  };
  const bankingGrpcClient = {
    getAccountTransactions: jest.fn(async () => ({
      openingBalance: '0.00',
      closingBalance: '38.00',
      total: 2,
      snapshotAt: '2026-04-30 23:59:59.999999',
      transactions: [
        {
          transferId: 41,
          transactionDate: '2026-04-02 09:00:00.000000',
          transactionType: 'CREDIT',
          amount: '50.00',
          description: 'Transfer from account 4',
        },
        {
          transferId: 42,
          transactionDate: '2026-04-03 10:00:00.000000',
          transactionType: 'DEBIT',
          amount: '12.00',
          description: 'Transfer to account 5',
        },
      ],
    })),
  };

  return {
    service: new StatementService(
      statementRepository as unknown as Repository<Statement>,
      statementTransactionRepository as unknown as Repository<StatementTransaction>,
      bankingGrpcClient as unknown as BankingGrpcClient,
      new StatementCalculationService(),
    ),
    statementRepository,
    statementTransactionRepository,
    bankingGrpcClient,
  };
}

function createReadService(options?: {
  statement?: Partial<Statement>;
  total?: number;
  transactions?: Partial<StatementTransaction>[];
}) {
  const statement = {
    id: 12,
    accountId: 8,
    fromDate: '2026-04-01',
    toDate: '2026-04-30',
    openingBalance: '100.00',
    closingBalance: '150.00',
    generatedAt: new Date('2026-05-01T00:00:00.000Z'),
    status: 'GENERATED',
    ...options?.statement,
  };
  const transactions = options?.transactions ?? [
    { id: 4, statementId: 12, transactionType: 'CREDIT' },
    { id: 3, statementId: 12, transactionType: 'DEBIT' },
    { id: 2, statementId: 12, transactionType: 'CREDIT' },
  ];
  const queryBuilder = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getCount: jest.fn(async () => options?.total ?? transactions.length),
    getMany: jest.fn(async () => transactions),
  };
  const statementRepository = {
    findOne: jest.fn(async () => statement),
  };
  const statementTransactionRepository = {
    createQueryBuilder: jest.fn(() => queryBuilder),
  };
  const bankingGrpcClient = { getAccountTransactions: jest.fn() };

  return {
    service: new StatementService(
      statementRepository as unknown as Repository<Statement>,
      statementTransactionRepository as unknown as Repository<StatementTransaction>,
      bankingGrpcClient as unknown as BankingGrpcClient,
      new StatementCalculationService(),
    ),
    statementRepository,
    statementTransactionRepository,
    queryBuilder,
    statement,
    transactions,
  };
}

describe('StatementService', () => {
  it('calculates balances and saves a statement with its transfers', async () => {
    const context = createService();
    const response = await context.service.generateStatement({
      accountId: 8,
      fromDate: '2026-04-01',
      toDate: '2026-04-30',
    });

    expect(response).toMatchObject({
      success: true,
      statement: {
        id: 12,
        openingBalance: '0.00',
        closingBalance: '38.00',
        transactions: [
          { transferId: 41, transactionType: 'CREDIT', balanceAfter: '50.00' },
          { transferId: 42, transactionType: 'DEBIT', balanceAfter: '38.00' },
        ],
      },
    });
    expect(
      context.bankingGrpcClient.getAccountTransactions,
    ).toHaveBeenCalledWith(8, '2026-04-01', '2026-04-30');
    expect(context.statementRepository.save).toHaveBeenCalledTimes(1);
    expect(context.statementTransactionRepository.save).toHaveBeenCalledTimes(
      1,
    );
  });

  it('rejects invalid calendar dates and reversed ranges', async () => {
    const context = createService();

    await expect(
      context.service.generateStatement({
        accountId: 8,
        fromDate: '2026-02-30',
        toDate: '2026-03-01',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      context.service.generateStatement({
        accountId: 8,
        fromDate: '2026-04-30',
        toDate: '2026-04-01',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(
      context.bankingGrpcClient.getAccountTransactions,
    ).not.toHaveBeenCalled();
  });

  it('returns all transactions and preserves statement balances without query options', async () => {
    const context = createReadService();

    const response = await context.service.getStatementByIdWithTransactions({
      statementId: 12,
      paginate: false,
    });

    expect(response).toMatchObject({
      found: true,
      total: 3,
      page: 1,
      limit: 3,
      totalPages: 1,
      statement: {
        openingBalance: '100.00',
        closingBalance: '150.00',
        transactions: context.transactions,
      },
    });
    expect(context.queryBuilder.skip).not.toHaveBeenCalled();
    expect(context.queryBuilder.take).not.toHaveBeenCalled();
  });

  it.each(['CREDIT', 'DEBIT'] as const)(
    'filters transactions by %s',
    async (transactionType) => {
      const context = createReadService();

      await context.service.getStatementByIdWithTransactions({
        statementId: 12,
        transactionType,
        paginate: true,
      });

      expect(context.queryBuilder.andWhere).toHaveBeenCalledWith(
        'st.transactionType = :transactionType',
        { transactionType },
      );
      expect(context.queryBuilder.skip).toHaveBeenCalledWith(0);
      expect(context.queryBuilder.take).toHaveBeenCalledWith(10);
    },
  );

  it('applies transaction type and pagination together', async () => {
    const context = createReadService({
      total: 5,
      transactions: [{ id: 2, transactionType: 'CREDIT' }],
    });

    const response = await context.service.getStatementByIdWithTransactions({
      statementId: 12,
      transactionType: 'CREDIT',
      page: 2,
      limit: 2,
      paginate: true,
    });

    expect(context.queryBuilder.andWhere).toHaveBeenCalledWith(
      'st.transactionType = :transactionType',
      { transactionType: 'CREDIT' },
    );
    expect(context.queryBuilder.skip).toHaveBeenCalledWith(2);
    expect(context.queryBuilder.take).toHaveBeenCalledWith(2);
    expect(response).toMatchObject({
      total: 5,
      page: 2,
      limit: 2,
      totalPages: 3,
    });
  });

  it('filters by inclusive calendar-date bounds using an exclusive next-day upper bound', async () => {
    const context = createReadService();

    await context.service.getStatementByIdWithTransactions({
      statementId: 12,
      fromDate: '2026-04-02',
      toDate: '2026-04-03',
      paginate: true,
    });

    expect(context.queryBuilder.andWhere).toHaveBeenNthCalledWith(
      1,
      'st.transactionDate >= :fromDate',
      { fromDate: '2026-04-02 00:00:00' },
    );
    expect(context.queryBuilder.andWhere).toHaveBeenNthCalledWith(
      2,
      'st.transactionDate < :toDate',
      { toDate: '2026-04-04 00:00:00' },
    );
    expect(context.queryBuilder.skip).toHaveBeenCalledWith(0);
    expect(context.queryBuilder.take).toHaveBeenCalledWith(10);
  });

  it('combines date range, transaction type, and pagination conditions', async () => {
    const context = createReadService();

    await context.service.getStatementByIdWithTransactions({
      statementId: 12,
      transactionType: 'DEBIT',
      fromDate: '2026-04-02',
      toDate: '2026-04-03',
      page: 2,
      limit: 1,
      paginate: true,
    });

    expect(context.queryBuilder.andWhere).toHaveBeenNthCalledWith(
      1,
      'st.transactionType = :transactionType',
      { transactionType: 'DEBIT' },
    );
    expect(context.queryBuilder.andWhere).toHaveBeenNthCalledWith(
      2,
      'st.transactionDate >= :fromDate',
      { fromDate: '2026-04-02 00:00:00' },
    );
    expect(context.queryBuilder.andWhere).toHaveBeenNthCalledWith(
      3,
      'st.transactionDate < :toDate',
      { toDate: '2026-04-04 00:00:00' },
    );
    expect(context.queryBuilder.skip).toHaveBeenCalledWith(1);
    expect(context.queryBuilder.take).toHaveBeenCalledWith(1);
  });

  it('returns an empty result and zero pages when date and type filters match nothing', async () => {
    const context = createReadService({ total: 0, transactions: [] });

    const response = await context.service.getStatementByIdWithTransactions({
      statementId: 12,
      transactionType: 'CREDIT',
      fromDate: '2026-04-02',
      toDate: '2026-04-03',
      page: 1,
      limit: 10,
      paginate: true,
    });

    expect(response).toMatchObject({
      found: true,
      total: 0,
      page: 1,
      limit: 10,
      totalPages: 1,
      statement: {
        openingBalance: '100.00',
        closingBalance: '150.00',
        transactions: [],
      },
    });
  });

  it.each([
    { transactionType: 'TRANSFER' },
    { page: 0, paginate: true },
    { page: 2_147_483_648, paginate: true },
    { limit: 101, paginate: true },
  ])('rejects invalid transaction filter and pagination input: %o', async (input) => {
    const context = createReadService();

    await expect(
      context.service.getStatementByIdWithTransactions({
        statementId: 12,
        ...input,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('reports a missing statement without querying its transactions', async () => {
    const context = createReadService();
    context.statementRepository.findOne.mockResolvedValue(null);

    await expect(
      context.service.getStatementByIdWithTransactions({ statementId: 88 }),
    ).resolves.toMatchObject({
      statement: null,
      found: false,
      total: 0,
    });
    expect(
      context.statementTransactionRepository.createQueryBuilder,
    ).not.toHaveBeenCalled();
  });
});
