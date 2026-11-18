import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { of } from 'rxjs';
import { STATEMENT_GRPC_CLIENT } from '../grpc/grpc-clients.module.js';
import {
  GenerateStatementDto,
  StatementTransactionsQueryDto,
} from './statements.dto.js';
import { StatementsController } from './statements.controller.js';
import { StatementsService } from './statements.service.js';

describe('StatementsController', () => {
  let controller: StatementsController;
  const service = { generate: jest.fn(), getById: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StatementsController],
      providers: [{ provide: StatementsService, useValue: service }],
    }).compile();
    controller = module.get(StatementsController);
  });

  it('passes statement generation input to the service', async () => {
    const dto: GenerateStatementDto = {
      accountId: 4,
      fromDate: '2026-01-01',
      toDate: '2026-01-31',
    };
    service.generate.mockResolvedValue({ success: true });

    await expect(controller.generate(dto)).resolves.toEqual({ success: true });
    expect(service.generate).toHaveBeenCalledWith(dto);
  });

  it('passes transaction query parameters to statement retrieval', async () => {
    const query: StatementTransactionsQueryDto = {
      transactionType: 'CREDIT',
      fromDate: '2026-01-01',
      toDate: '2026-01-31',
      page: 2,
      limit: 5,
    };
    service.getById.mockResolvedValue({ id: 9, transactions: [] });

    await controller.getById({ id: 9 }, query);

    expect(service.getById).toHaveBeenCalledWith(9, query);
  });
});

describe('StatementsService', () => {
  it('uses the CSV and PDF export RPCs', async () => {
    const csvFile = {
      fileName: 'statement-9.csv',
      contentType: 'text/csv',
      content: Buffer.from('statement,csv'),
    };
    const pdfFile = {
      fileName: 'statement-9.pdf',
      contentType: 'application/pdf',
      content: Buffer.from('%PDF-1.7'),
    };
    const rpc = {
      exportStatementCsv: jest.fn().mockReturnValue(of(csvFile)),
      exportStatementPdf: jest.fn().mockReturnValue(of(pdfFile)),
    };
    const module = await Test.createTestingModule({
      providers: [
        StatementsService,
        {
          provide: STATEMENT_GRPC_CLIENT,
          useValue: { getService: jest.fn().mockReturnValue(rpc) },
        },
      ],
    }).compile();
    const service = module.get(StatementsService);
    service.onModuleInit();

    await expect(service.exportCsv(9)).resolves.toEqual(csvFile);
    await expect(service.exportPdf(9)).resolves.toEqual(pdfFile);
    expect(rpc.exportStatementCsv).toHaveBeenCalledWith({ statementId: 9 });
    expect(rpc.exportStatementPdf).toHaveBeenCalledWith({ statementId: 9 });
  });

  it.each([
    {
      name: 'transaction filtering',
      query: { transactionType: 'DEBIT' },
      expected: {
        transactionType: 'DEBIT',
        fromDate: undefined,
        toDate: undefined,
        page: 1,
        limit: 10,
        paginate: true,
      },
    },
    {
      name: 'pagination without a transaction filter',
      query: { page: 3, limit: 20 },
      expected: {
        transactionType: undefined,
        fromDate: undefined,
        toDate: undefined,
        page: 3,
        limit: 20,
        paginate: true,
      },
    },
    {
      name: 'date-range filtering',
      query: { fromDate: '2026-01-01', toDate: '2026-01-31' },
      expected: {
        transactionType: undefined,
        fromDate: '2026-01-01',
        toDate: '2026-01-31',
        page: 1,
        limit: 10,
        paginate: true,
      },
    },
  ])('forwards $name to the statement RPC', async ({ query, expected }) => {
    const rpc = {
      getStatementByIdWithTransactions: jest.fn().mockReturnValue(
        of({
          statement: {
            openingBalance: '100.00',
            closingBalance: '125.00',
            transactions: [],
          },
          found: true,
          total: 0,
          page: expected.page,
          limit: expected.limit,
          totalPages: 0,
        }),
      ),
    };
    const module = await Test.createTestingModule({
      providers: [
        StatementsService,
        {
          provide: STATEMENT_GRPC_CLIENT,
          useValue: { getService: jest.fn().mockReturnValue(rpc) },
        },
      ],
    }).compile();
    const service = module.get(StatementsService);
    service.onModuleInit();

    await expect(service.getById(9, query)).resolves.toMatchObject({
      openingBalance: '100.00',
      closingBalance: '125.00',
    });
    expect(rpc.getStatementByIdWithTransactions).toHaveBeenCalledWith({
      statementId: 9,
      ...expected,
    });
  });

  it('maps transaction filters and pagination to the statement RPC', async () => {
    const statement = {
      id: 9,
      accountId: 4,
      fromDate: '2026-01-01',
      toDate: '2026-01-31',
      openingBalance: '100.00',
      closingBalance: '125.00',
      generatedAt: '2026-02-01T00:00:00.000Z',
      status: 'GENERATED',
      transactions: [{ id: 3, transactionType: 'CREDIT' }],
    };
    const rpc = {
      getStatementByIdWithTransactions: jest.fn().mockReturnValue(
        of({
          statement,
          found: true,
          total: 4,
          page: 2,
          limit: 1,
          totalPages: 4,
        }),
      ),
    };
    const module = await Test.createTestingModule({
      providers: [
        StatementsService,
        {
          provide: STATEMENT_GRPC_CLIENT,
          useValue: { getService: jest.fn().mockReturnValue(rpc) },
        },
      ],
    }).compile();
    const service = module.get(StatementsService);
    service.onModuleInit();

    await expect(
      service.getById(9, {
        transactionType: 'CREDIT',
        fromDate: '2026-01-01',
        toDate: '2026-01-31',
        page: 2,
        limit: 1,
      }),
    ).resolves.toEqual({
      ...statement,
      total: 4,
      page: 2,
      limit: 1,
      totalPages: 4,
    });
    expect(rpc.getStatementByIdWithTransactions).toHaveBeenCalledWith({
      statementId: 9,
      transactionType: 'CREDIT',
      fromDate: '2026-01-01',
      toDate: '2026-01-31',
      page: 2,
      limit: 1,
      paginate: true,
    });
  });

  it('requests all transactions when no query options are provided', async () => {
    const statement = {
      id: 9,
      accountId: 4,
      fromDate: '2026-01-01',
      toDate: '2026-01-31',
      openingBalance: '100.00',
      closingBalance: '125.00',
      generatedAt: '2026-02-01T00:00:00.000Z',
      status: 'GENERATED',
      transactions: [{ id: 2, transactionType: 'DEBIT' }],
    };
    const rpc = {
      getStatementByIdWithTransactions: jest.fn().mockReturnValue(
        of({
          statement,
          found: true,
          total: 1,
          page: 1,
          limit: 1,
          totalPages: 1,
        }),
      ),
    };
    const module = await Test.createTestingModule({
      providers: [
        StatementsService,
        {
          provide: STATEMENT_GRPC_CLIENT,
          useValue: { getService: jest.fn().mockReturnValue(rpc) },
        },
      ],
    }).compile();
    const service = module.get(StatementsService);
    service.onModuleInit();

    await expect(service.getById(9)).resolves.toMatchObject({
      transactions: statement.transactions,
      total: 1,
    });
    expect(rpc.getStatementByIdWithTransactions).toHaveBeenCalledWith({
      statementId: 9,
      transactionType: undefined,
      fromDate: undefined,
      toDate: undefined,
      page: 1,
      limit: 10,
      paginate: false,
    });
  });

  it('returns not found when the Statement Service has no matching statement', async () => {
    const rpc = {
      getStatementByIdWithTransactions: jest
        .fn()
        .mockReturnValue(
          of({ statement: undefined, found: false, total: 0, page: 1, limit: 10, totalPages: 0 }),
        ),
    };
    const module = await Test.createTestingModule({
      providers: [
        StatementsService,
        {
          provide: STATEMENT_GRPC_CLIENT,
          useValue: { getService: jest.fn().mockReturnValue(rpc) },
        },
      ],
    }).compile();
    const service = module.get(StatementsService);
    service.onModuleInit();

    await expect(service.getById(88)).rejects.toThrow('Statement 88 was not found');
  });
});

describe('StatementTransactionsQueryDto', () => {
  it('normalizes valid transaction type and accepts integer pagination values', async () => {
    const query = plainToInstance(StatementTransactionsQueryDto, {
      transactionType: 'credit',
      fromDate: '2026-01-01',
      toDate: '2026-01-31',
      page: '2',
      limit: '25',
    });

    expect(await validate(query)).toHaveLength(0);
    expect(query).toMatchObject({
      transactionType: 'CREDIT',
      fromDate: '2026-01-01',
      toDate: '2026-01-31',
      page: 2,
      limit: 25,
    });
  });

  it.each([
    { transactionType: 'TRANSFER' },
    { fromDate: '2026-02-30' },
    { fromDate: '01-01-2026' },
    { toDate: 'not-a-date' },
    { page: '0' },
    { page: '1.5' },
    { page: '2147483648' },
    { limit: '0' },
    { limit: '101' },
    { limit: 'not-a-number' },
  ])('rejects invalid query parameters: %o', async (input) => {
    const query = plainToInstance(StatementTransactionsQueryDto, input);

    expect(await validate(query)).not.toHaveLength(0);
  });
});
