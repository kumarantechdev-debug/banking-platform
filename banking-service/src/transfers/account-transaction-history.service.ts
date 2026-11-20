import { status } from '@grpc/grpc-js';
import { Injectable, Logger } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { DataSource, EntityManager } from 'typeorm';
import { driverError, grpcError } from '../common/grpc-errors';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

export interface GetAccountTransactionHistoryInput {
  accountId: number;
  fromDate: string;
  toDate: string;
  page?: number;
  limit?: number;
  snapshotAt?: string;
}

interface AccountRow {
  id: number;
  createdDate: string;
}

interface BalanceRow {
  balanceAfter: string | number;
}

interface LedgerBoundaryRow extends BalanceRow {
  effectiveAt: string;
}

interface TransactionRow {
  transferId: number | null;
  referenceNumber: string;
  transactionDate: string;
  transactionType: 'CREDIT' | 'DEBIT';
  amount: string | number;
  description: string;
  isAccountOpening: boolean | number | string;
}

export interface AccountHistoryTransaction {
  transferId?: number;
  referenceNumber: string;
  transactionDate: string;
  transactionType: 'CREDIT' | 'DEBIT';
  amount: string;
  description: string;
  isAccountOpening: boolean;
}

export interface GetAccountTransactionHistoryResponse {
  transactions: AccountHistoryTransaction[];
  openingBalance: string;
  closingBalance: string;
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  snapshotAt: string;
}

@Injectable()
export class AccountTransactionHistoryService {
  private readonly logger = new Logger(AccountTransactionHistoryService.name);

  constructor(private readonly dataSource: DataSource) {}

  async getAccountTransactionHistory(
    input: GetAccountTransactionHistoryInput,
  ): Promise<GetAccountTransactionHistoryResponse> {
    const request = this.validate(input);

    try {
      return await this.dataSource.transaction(
        'REPEATABLE READ',
        async (manager) => this.queryHistory(manager, request),
      );
    } catch (error) {
      if (error instanceof RpcException) {
        throw error;
      }

      this.logger.error(
        'Failed to retrieve account transaction history',
        error instanceof Error ? error.stack : String(error),
      );
      const databaseError = driverError(error);
      if (
        databaseError.code === 'ECONNREFUSED' ||
        databaseError.code === 'PROTOCOL_CONNECTION_LOST' ||
        databaseError.code === 'ETIMEDOUT'
      ) {
        throw grpcError(status.UNAVAILABLE, 'Banking database is unavailable.');
      }

      throw grpcError(
        status.INTERNAL,
        'Account transaction history could not be retrieved.',
      );
    }
  }

  private async queryHistory(
    manager: EntityManager,
    request: Required<GetAccountTransactionHistoryInput>,
  ): Promise<GetAccountTransactionHistoryResponse> {
    const accountRows = (await manager.query(
      `SELECT id, DATE_FORMAT(createdAt, '%Y-%m-%d') AS createdDate
       FROM accounts WHERE id = ? LIMIT 1`,
      [request.accountId],
    )) as AccountRow[];
    const account = accountRows[0];
    if (!account) {
      throw grpcError(status.NOT_FOUND, 'Account not found.');
    }

    const snapshotAt =
      request.snapshotAt ||
      (
        (await manager.query(
          `SELECT DATE_FORMAT(
             GREATEST(
               NOW(6),
               COALESCE(
                 (SELECT MAX(effectiveAt)
                  FROM account_balance_ledger
                  WHERE accountId = ?),
                 NOW(6)
               )
             ),
             '%Y-%m-%d %H:%i:%s.%f'
           ) AS snapshotAt`,
          [request.accountId],
        )) as Array<{ snapshotAt: string }>
      )[0]?.snapshotAt;
    if (!snapshotAt) {
      throw grpcError(status.INTERNAL, 'A history snapshot could not be created.');
    }

    const openingRows = (await manager.query(
      `SELECT CAST(balanceAfter AS CHAR) AS balanceAfter
       FROM account_balance_ledger
       WHERE accountId = ? AND effectiveAt < ? AND effectiveAt <= ?
       ORDER BY effectiveAt DESC, id DESC
       LIMIT 1`,
      [request.accountId, `${request.fromDate} 00:00:00`, snapshotAt],
    )) as BalanceRow[];

    let openingBalance: string;
    if (openingRows[0]) {
      openingBalance = String(openingRows[0].balanceAfter);
    } else if (account.createdDate >= request.fromDate) {
      openingBalance = '0.00';
    } else {
      const baselineRows = (await manager.query(
        `SELECT DATE_FORMAT(effectiveAt, '%Y-%m-%d %H:%i:%s.%f') AS effectiveAt
         FROM account_balance_ledger
         WHERE accountId = ? AND entryType = 'BASELINE'
         ORDER BY effectiveAt ASC, id ASC
         LIMIT 1`,
        [request.accountId],
      )) as LedgerBoundaryRow[];
      const baseline = baselineRows[0]?.effectiveAt;
      const detail = baseline
        ? ` Ledger history begins at ${baseline}; older balances were not reconstructed.`
        : ' No historical balance baseline is available.';
      throw grpcError(
        status.FAILED_PRECONDITION,
        `The opening balance for account ${request.accountId} on ${request.fromDate} cannot be reconstructed safely.${detail}`,
      );
    }

    const endExclusive = `${request.toDate} 00:00:00`;
    const closingRows = (await manager.query(
      `SELECT CAST(balanceAfter AS CHAR) AS balanceAfter
       FROM account_balance_ledger
       WHERE accountId = ?
         AND effectiveAt < DATE_ADD(?, INTERVAL 1 DAY)
         AND effectiveAt <= ?
       ORDER BY effectiveAt DESC, id DESC
       LIMIT 1`,
      [request.accountId, endExclusive, snapshotAt],
    )) as BalanceRow[];
    const closingBalance = closingRows[0]
      ? String(closingRows[0].balanceAfter)
      : account.createdDate > request.toDate
        ? '0.00'
        : openingBalance;

    const transactionFilter = `
       FROM account_balance_ledger
       WHERE accountId = ?
         AND (
           entryType = 'TRANSFER'
           OR (entryType = 'ACCOUNT_OPENING' AND amount <> 0)
         )
         AND effectiveAt >= ?
         AND effectiveAt < DATE_ADD(?, INTERVAL 1 DAY)
         AND effectiveAt <= ?`;
    const filterParams = [
      request.accountId,
      `${request.fromDate} 00:00:00`,
      endExclusive,
      snapshotAt,
    ];
    const countRows = (await manager.query(
      `SELECT COUNT(*) AS total ${transactionFilter}`,
      filterParams,
    )) as Array<{ total: number | string }>;
    const total = Number(countRows[0]?.total ?? 0);

    const transactionRows = (await manager.query(
      `SELECT transferId, COALESCE(referenceNumber, '') AS referenceNumber,
              DATE_FORMAT(effectiveAt, '%Y-%m-%d %H:%i:%s.%f') AS transactionDate,
              COALESCE(transactionType, 'CREDIT') AS transactionType,
              CAST(amount AS CHAR) AS amount, description,
              (entryType = 'ACCOUNT_OPENING') AS isAccountOpening
       ${transactionFilter}
       ORDER BY effectiveAt ASC, transferId ASC, id ASC
       LIMIT ? OFFSET ?`,
      [
        ...filterParams,
        request.limit,
        (request.page - 1) * request.limit,
      ],
    )) as TransactionRow[];

    return {
      transactions: transactionRows.map((row) => ({
        ...(row.transferId === null
          ? {}
          : { transferId: Number(row.transferId) }),
        referenceNumber: row.referenceNumber,
        transactionDate: row.transactionDate,
        transactionType: row.transactionType,
        amount: String(row.amount),
        description: row.description,
        isAccountOpening:
          row.isAccountOpening === true ||
          row.isAccountOpening === 1 ||
          row.isAccountOpening === '1',
      })),
      openingBalance,
      closingBalance,
      total,
      page: request.page,
      limit: request.limit,
      totalPages: Math.ceil(total / request.limit),
      snapshotAt,
    };
  }

  private validate(
    input: GetAccountTransactionHistoryInput,
  ): Required<GetAccountTransactionHistoryInput> {
    if (
      !Number.isInteger(input.accountId) ||
      input.accountId < 1 ||
      input.accountId > 2_147_483_647
    ) {
      throw grpcError(status.INVALID_ARGUMENT, 'Invalid account ID.');
    }

    this.validateDate(input.fromDate, 'fromDate');
    this.validateDate(input.toDate, 'toDate');
    if (input.fromDate > input.toDate) {
      throw grpcError(
        status.INVALID_ARGUMENT,
        'fromDate cannot be after toDate.',
      );
    }

    const page = input.page === undefined || input.page === 0
      ? DEFAULT_PAGE
      : input.page;
    const limit = input.limit === undefined || input.limit === 0
      ? DEFAULT_LIMIT
      : input.limit;
    if (!Number.isInteger(page) || page < 1 || page > 2_147_483_647) {
      throw grpcError(status.INVALID_ARGUMENT, 'page must be a positive integer.');
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
      throw grpcError(
        status.INVALID_ARGUMENT,
        `limit must be between 1 and ${MAX_LIMIT}.`,
      );
    }

    const snapshotAt = input.snapshotAt ?? '';
    if (
      snapshotAt &&
      !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{6}$/.test(snapshotAt)
    ) {
      throw grpcError(status.INVALID_ARGUMENT, 'Invalid history snapshot.');
    }

    return { ...input, page, limit, snapshotAt };
  }

  private validateDate(value: string, field: 'fromDate' | 'toDate'): void {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw grpcError(
        status.INVALID_ARGUMENT,
        `${field} must be a valid date in YYYY-MM-DD format.`,
      );
    }

    const parsedDate = new Date(`${value}T00:00:00.000Z`);
    if (
      Number.isNaN(parsedDate.getTime()) ||
      parsedDate.toISOString().slice(0, 10) !== value
    ) {
      throw grpcError(
        status.INVALID_ARGUMENT,
        `${field} must be a valid date in YYYY-MM-DD format.`,
      );
    }
  }
}
