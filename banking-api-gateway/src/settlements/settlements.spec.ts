import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { of, throwError } from 'rxjs';
import { PositiveIdParamDto } from '../common/positive-id-param.dto.js';
import { SETTLEMENT_GRPC_CLIENT } from '../grpc/grpc-clients.module.js';
import { CreateSettlementDto } from './settlements.dto.js';
import { SettlementsController } from './settlements.controller.js';
import { SettlementsService } from './settlements.service.js';

describe('SettlementsController', () => {
  let controller: SettlementsController;
  const service = {
    create: jest.fn(),
    process: jest.fn(),
    getById: jest.fn(),
    getReport: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SettlementsController],
      providers: [{ provide: SettlementsService, useValue: service }],
    }).compile();
    controller = module.get(SettlementsController);
  });

  it('passes the requested settlement date to the service', async () => {
    const dto: CreateSettlementDto = { jobDate: '2026-01-31' };
    service.create.mockResolvedValue({ jobId: 12, jobDate: dto.jobDate });

    await expect(controller.create(dto)).resolves.toMatchObject({ jobId: 12 });
    expect(service.create).toHaveBeenCalledWith(dto);
  });

  it('returns the failure report for the requested settlement job', async () => {
    const report = {
      job: { id: 12, status: 'COMPLETED', failedTransactions: 1 },
      failureTransactions: [
        {
          transferId: 31,
          amount: '25.00',
          retryCount: 3,
          errorMessage: 'Insufficient funds',
          processedAt: '2026-02-01T10:00:00.000Z',
        },
      ],
    };
    service.getReport.mockResolvedValue(report);

    await expect(controller.getReport({ id: 12 })).resolves.toEqual(report);
    expect(service.getReport).toHaveBeenCalledWith(12);
  });
});

describe('SettlementsService', () => {
  it('maps processing to the ProcessSettlement RPC with jobId', async () => {
    const response = { job: { id: 12, status: 'COMPLETED' } };
    const rpc = { processSettlement: jest.fn().mockReturnValue(of(response)) };
    const module = await Test.createTestingModule({
      providers: [
        SettlementsService,
        {
          provide: SETTLEMENT_GRPC_CLIENT,
          useValue: { getService: jest.fn().mockReturnValue(rpc) },
        },
      ],
    }).compile();
    const service = module.get(SettlementsService);
    service.onModuleInit();

    await expect(service.process(12)).resolves.toEqual(response);
    expect(rpc.processSettlement).toHaveBeenCalledWith({ jobId: 12 });
  });

  it('maps report retrieval to the GetSettlementReport RPC with jobId', async () => {
    const report = {
      job: { id: 12, failedTransactions: 1 },
      transactions: [
        {
          transferId: 31,
          amount: '25.00',
          retryCount: 3,
          errorMessage: 'Insufficient funds',
          processedAt: '2026-02-01T10:00:00.000Z',
        },
      ],
    };
    const rpc = {
      getSettlementReport: jest.fn().mockReturnValue(of(report)),
    };
    const module = await Test.createTestingModule({
      providers: [
        SettlementsService,
        {
          provide: SETTLEMENT_GRPC_CLIENT,
          useValue: { getService: jest.fn().mockReturnValue(rpc) },
        },
      ],
    }).compile();
    const service = module.get(SettlementsService);
    service.onModuleInit();

    await expect(service.getReport(12)).resolves.toEqual({
      job: report.job,
      failureTransactions: report.transactions,
    });
    expect(rpc.getSettlementReport).toHaveBeenCalledWith({ jobId: 12 });
  });

  it('propagates errors returned by the Settlement Service', async () => {
    const downstreamError = Object.assign(new Error('downstream failure'), {
      code: 14,
    });
    const rpc = {
      getSettlementReport: jest.fn().mockReturnValue(
        throwError(() => downstreamError),
      ),
    };
    const module = await Test.createTestingModule({
      providers: [
        SettlementsService,
        {
          provide: SETTLEMENT_GRPC_CLIENT,
          useValue: { getService: jest.fn().mockReturnValue(rpc) },
        },
      ],
    }).compile();
    const service = module.get(SettlementsService);
    service.onModuleInit();

    await expect(service.getReport(12)).rejects.toBe(downstreamError);
  });
});

describe('PositiveIdParamDto used by settlement report', () => {
  it.each(['0', '-1', 'not-an-id'])('rejects invalid job ID %s', async (id) => {
    const params = plainToInstance(PositiveIdParamDto, { id });

    expect(await validate(params)).not.toHaveLength(0);
  });
});
