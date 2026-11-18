import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { status } from '@grpc/grpc-js';
import { RpcException } from '@nestjs/microservices';
import { DataSource, EntityManager, MoreThan } from 'typeorm';
import {
  grpcError,
  isDuplicateEntry,
  mapDatabaseError,
} from '../common/grpc-errors';
import {
  fromMinorUnits,
  isValidMoney,
  isWithinDecimalRange,
  normalizeMoney,
  toMinorUnits,
} from '../common/money';
import { Account, AccountStatus } from '../accounts/account.entity';
import { AccountBalanceLedgerEntry } from '../ledger/account-balance-ledger-entry.entity';
import { TransferAudit, TransferAuditAction } from './transfer-audit.entity';
import {
  Transfer,
  TransferSettlementStatus,
  TransferStatus,
} from './transfer.entity';

export interface CreateTransferInput {
  fromAccountId: number;
  toAccountId: number;
  amount: string;
  idempotencyKey: string;
}

export interface GetTransferInput {
  transferId: number;
}

export interface GetPendingTransfersInput {
  batchSize: number;
  status: string;
  afterTransferId: number;
}

export interface UpdateTransferSettlementStatusInput {
  transferId: number;
  settlementStatus: string;
}

@Injectable()
export class TransfersService {
  constructor(private readonly dataSource: DataSource) {}

  async createTransfer(input: CreateTransferInput): Promise<Transfer> {
    this.validateRequest(input);
    const amount = normalizeMoney(input.amount);

    try {
      return await this.dataSource.transaction(
        'READ COMMITTED',
        async (manager) => this.executeTransfer(manager, input, amount),
      );
    } catch (error) {
      if (error instanceof RpcException) {
        throw error;
      }
      if (isDuplicateEntry(error)) {
        const existing = await this.findByIdempotencyKey(input.idempotencyKey);
        if (existing) {
          this.assertMatchingRequest(existing, input, amount);
          return existing;
        }
      }
      throw mapDatabaseError(error);
    }
  }

  async getTransfer(input: GetTransferInput): Promise<Transfer> {
    if (
      !Number.isInteger(input.transferId) ||
      input.transferId < 1 ||
      input.transferId > 2_147_483_647
    ) {
      throw grpcError(status.INVALID_ARGUMENT, 'Invalid transfer ID.');
    }

    try {
      const transfer = await this.dataSource
        .getRepository(Transfer)
        .findOneBy({ id: input.transferId });
      if (!transfer) {
        throw grpcError(status.NOT_FOUND, 'Transfer not found.');
      }
      return transfer;
    } catch (error) {
      if (error instanceof RpcException) {
        throw error;
      }
      throw mapDatabaseError(error);
    }
  }

  async getPendingTransfers(
    input: GetPendingTransfersInput,
  ): Promise<{ transfers: Transfer[]; nextAfterTransferId: number }> {
    if (
      !Number.isInteger(input.batchSize) ||
      input.batchSize < 1 ||
      input.batchSize > 100 ||
      input.status !== TransferSettlementStatus.PENDING ||
      !Number.isInteger(input.afterTransferId) ||
      input.afterTransferId < 0
    ) {
      throw grpcError(
        status.INVALID_ARGUMENT,
        'Pending transfer queries require status PENDING and a batchSize from 1 to 100.',
      );
    }

    try {
      const transfers = await this.dataSource.getRepository(Transfer).find({
        where: {
          id: MoreThan(input.afterTransferId),
          status: TransferStatus.SUCCESS,
          settlementStatus: TransferSettlementStatus.PENDING,
        },
        order: { id: 'ASC' },
        take: input.batchSize,
      });
      return {
        transfers,
        nextAfterTransferId:
          transfers[transfers.length - 1]?.id ?? input.afterTransferId,
      };
    } catch (error) {
      throw mapDatabaseError(error);
    }
  }

  async updateTransferSettlementStatus(
    input: UpdateTransferSettlementStatusInput,
  ): Promise<{ success: boolean; message: string }> {
    if (
      !Number.isInteger(input.transferId) ||
      input.transferId < 1 ||
      input.transferId > 2_147_483_647 ||
      input.settlementStatus !== TransferSettlementStatus.SETTLED
    ) {
      throw grpcError(
        status.INVALID_ARGUMENT,
        'A valid transferId and settlementStatus SETTLED are required.',
      );
    }

    const repository = this.dataSource.getRepository(Transfer);
    try {
      const result = await repository.update(
        {
          id: input.transferId,
          status: TransferStatus.SUCCESS,
          settlementStatus: TransferSettlementStatus.PENDING,
        },
        { settlementStatus: TransferSettlementStatus.SETTLED },
      );
      if (result.affected === 1) {
        return { success: true, message: 'Transfer settlement status updated.' };
      }

      const transfer = await repository.findOneBy({ id: input.transferId });
      if (!transfer) {
        throw grpcError(status.NOT_FOUND, 'Transfer not found.');
      }
      if (transfer.status !== TransferStatus.SUCCESS) {
        throw grpcError(
          status.FAILED_PRECONDITION,
          'Only successful transfers can be settled.',
        );
      }
      if (transfer.settlementStatus === TransferSettlementStatus.SETTLED) {
        return { success: true, message: 'Transfer is already settled.' };
      }

      return {
        success: false,
        message: 'Transfer settlement status could not be updated.',
      };
    } catch (error) {
      if (error instanceof RpcException) {
        throw error;
      }
      throw mapDatabaseError(error);
    }
  }

  private validateRequest(input: CreateTransferInput): void {
    if (
      !Number.isInteger(input.fromAccountId) ||
      input.fromAccountId < 1 ||
      input.fromAccountId > 2_147_483_647 ||
      !Number.isInteger(input.toAccountId) ||
      input.toAccountId < 1 ||
      input.toAccountId > 2_147_483_647 ||
      !isValidMoney(input.amount) ||
      toMinorUnits(input.amount) === 0n ||
      typeof input.idempotencyKey !== 'string' ||
      !/^[A-Za-z0-9._:-]{8,100}$/.test(input.idempotencyKey)
    ) {
      throw grpcError(status.INVALID_ARGUMENT, 'Invalid transfer details.');
    }
    if (input.fromAccountId === input.toAccountId) {
      throw grpcError(
        status.INVALID_ARGUMENT,
        'Source and destination accounts must be different.',
      );
    }
  }

  private async executeTransfer(
    manager: EntityManager,
    input: CreateTransferInput,
    amount: string,
  ): Promise<Transfer> {
    const transfers = manager.getRepository(Transfer);
    const prior = await transfers.findOneBy({
      idempotencyKey: input.idempotencyKey,
    });
    if (prior) {
      this.assertMatchingRequest(prior, input, amount);
      return prior;
    }

    const accountIds = [input.fromAccountId, input.toAccountId].sort(
      (left, right) => left - right,
    );
    const accounts = await manager
      .getRepository(Account)
      .createQueryBuilder('account')
      .setLock('pessimistic_write')
      .where('account.id IN (:...accountIds)', { accountIds })
      .orderBy('account.id', 'ASC')
      .getMany();
    const concurrentPrior = await transfers.findOneBy({
      idempotencyKey: input.idempotencyKey,
    });
    if (concurrentPrior) {
      this.assertMatchingRequest(concurrentPrior, input, amount);
      return concurrentPrior;
    }

    const accountsById = new Map(
      accounts.map((account) => [account.id, account]),
    );
    const source = accountsById.get(input.fromAccountId);
    const destination = accountsById.get(input.toAccountId);

    if (!source || !destination) {
      throw grpcError(status.NOT_FOUND, 'One or more accounts were not found.');
    }

    if (
      source.status !== AccountStatus.ACTIVE ||
      destination.status !== AccountStatus.ACTIVE
    ) {
      throw grpcError(
        status.FAILED_PRECONDITION,
        'Both accounts must be active.',
      );
    }
    if (toMinorUnits(source.balance) < toMinorUnits(amount)) {
      throw grpcError(status.FAILED_PRECONDITION, 'Insufficient funds.');
    }
    if (
      !isWithinDecimalRange(
        toMinorUnits(destination.balance) + toMinorUnits(amount),
      )
    ) {
      throw grpcError(
        status.FAILED_PRECONDITION,
        'Destination account balance limit would be exceeded.',
      );
    }

    const transfer = transfers.create({
      referenceNumber: `TR-${randomUUID()}`,
      fromAccountId: source.id,
      toAccountId: destination.id,
      amount,
      status: TransferStatus.SUCCESS,
      idempotencyKey: input.idempotencyKey,
      createdAt: new Date(),
    });
    const savedTransfer = await transfers.save(transfer);
    const auditRepository = manager.getRepository(TransferAudit);
    await auditRepository.save(
      auditRepository.create({
        transferId: savedTransfer.id,
        fromAccountId: source.id,
        toAccountId: destination.id,
        amount,
        status: savedTransfer.status,
        action: TransferAuditAction.INITIATED,
        description: 'Transfer initiated.',
      }),
    );

    source.balance = fromMinorUnits(
      toMinorUnits(source.balance) - toMinorUnits(amount),
    );
    destination.balance = fromMinorUnits(
      toMinorUnits(destination.balance) + toMinorUnits(amount),
    );
    await manager.save([source, destination]);
    await manager.getRepository(AccountBalanceLedgerEntry).save([
      {
        accountId: source.id,
        transferId: savedTransfer.id,
        entryType: 'TRANSFER',
        transactionType: 'DEBIT',
        referenceNumber: savedTransfer.referenceNumber,
        amount,
        balanceAfter: source.balance,
        effectiveAt: savedTransfer.createdAt,
        description: `Transfer to account ${destination.id}`,
      },
      {
        accountId: destination.id,
        transferId: savedTransfer.id,
        entryType: 'TRANSFER',
        transactionType: 'CREDIT',
        referenceNumber: savedTransfer.referenceNumber,
        amount,
        balanceAfter: destination.balance,
        effectiveAt: savedTransfer.createdAt,
        description: `Transfer from account ${source.id}`,
      },
    ]);
    await auditRepository.save(
      auditRepository.create({
        transferId: savedTransfer.id,
        fromAccountId: source.id,
        toAccountId: destination.id,
        amount,
        status: TransferStatus.SUCCESS,
        action: TransferAuditAction.COMPLETED,
        description: 'Transfer completed.',
      }),
    );

    return savedTransfer;
  }

  private async findByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<Transfer | null> {
    try {
      return await this.dataSource
        .getRepository(Transfer)
        .findOneBy({ idempotencyKey });
    } catch {
      throw grpcError(
        status.INTERNAL,
        'The transfer result could not be retrieved.',
      );
    }
  }

  private assertMatchingRequest(
    transfer: Transfer,
    input: CreateTransferInput,
    amount: string,
  ): void {
    if (
      transfer.fromAccountId !== input.fromAccountId ||
      transfer.toAccountId !== input.toAccountId ||
      transfer.amount !== amount
    ) {
      throw grpcError(
        status.ALREADY_EXISTS,
        'Idempotency key was already used for a different transfer.',
      );
    }
  }
}
