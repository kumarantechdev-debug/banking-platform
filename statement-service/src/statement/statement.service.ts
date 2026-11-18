import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Statement } from '../database/entities/statement.entity';
import { StatementTransaction } from '../database/entities/statement-transaction.entity';
import { BankingGrpcClient } from '../banking/banking-grpc.client';
import { StatementCalculationService } from './statement-calculation.service';
import type {
  BankingTransaction,
  GenerateStatementRequest,
  GenerateStatementResponse,
  GetStatementResponse,
  StatementFilterRequest,
  StatementFileResponse,
  StatementFilterResponse,
  StatementRecord,
  StatementTransactionRecord,
  GetStatementByIdWithTransactionsRequest,
  GetStatementByIdWithTransactionsResponse,
} from './statement.types';

@Injectable()
export class StatementService {
  constructor(
    @InjectRepository(Statement)
    private readonly statementRepository: Repository<Statement>,
    @InjectRepository(StatementTransaction)
    private readonly statementTransactionRepository: Repository<StatementTransaction>,
    private readonly bankingGrpcClient: BankingGrpcClient,
    private readonly calculationService: StatementCalculationService,
  ) {}

  async generateStatement(request: GenerateStatementRequest): Promise<GenerateStatementResponse> {
    const accountId = this.validateAccountId(request.accountId);
    const fromDate = this.validateDateString(request.fromDate, 'fromDate');
    const toDate = this.validateDateString(request.toDate, 'toDate');

    if (fromDate > toDate) {
      throw new BadRequestException('fromDate cannot be after toDate.');
    }

    const history = await this.bankingGrpcClient.getAccountTransactions(
      accountId,
      fromDate,
      toDate,
    );

    const normalizedTransactions = history.transactions.map((transaction) =>
      this.calculationService.normalizeTransaction(transaction),
    );
    const sortedTransactions = this.calculationService.sortTransactions(normalizedTransactions);
    const openingBalance = history.openingBalance;
    const closingBalance = history.closingBalance;
    const calculatedClosingBalance =
      this.calculationService.calculateClosingBalance(
        openingBalance,
        sortedTransactions,
      );
    if (calculatedClosingBalance !== closingBalance) {
      throw new Error(
        'Banking Service transaction history does not reconcile to its closing balance.',
      );
    }
    const transactionsWithBalances =
      this.calculationService.createBalanceAfter(
        openingBalance,
        sortedTransactions,
      );

    const statement = this.statementRepository.create({
      accountId,
      fromDate,
      toDate,
      openingBalance,
      closingBalance,
      generatedAt: new Date(),
      status: 'GENERATED',
    });

    const savedStatement = await this.statementRepository.save(statement);

    const transactionEntities = transactionsWithBalances.map((transaction) => {
      const isAccountOpening = transaction.isAccountOpening === true;
      const transferId = isAccountOpening
        ? null
        : Number(transaction.transferId ?? transaction.id);
      const amount = this.getTransactionAmount(transaction);
      return this.statementTransactionRepository.create({
        statementId: savedStatement.id,
        transferId,
        isAccountOpening,
        transactionDate: this.parseDateTime(transaction.transactionDate),
        transactionType: this.resolveTransactionType(transaction),
        amount,
        description: transaction.description ?? 'Transfer',
        balanceAfter: String(transaction.balanceAfter ?? '0.00'),
      });
    });

    await this.statementTransactionRepository.save(transactionEntities);

    const savedWithTransactions = Object.assign({}, savedStatement, {
      transactions: transactionEntities,
    }) as StatementRecord;

    return {
      statement: savedWithTransactions,
      success: true,
      message: 'Statement generated successfully.',
    };
  }

  async getStatement(statementId: number): Promise<GetStatementResponse> {
    const validId = this.validateStatementId(statementId);
    const statement = await this.statementRepository.findOne({ where: { id: validId } });

    if (!statement) {
      return { statement: null, found: false };
    }

    const transactions = await this.statementTransactionRepository.find({
      where: { statementId: statement.id },
      order: { transactionDate: 'DESC', id: 'DESC' },
    });

    return {
      statement: Object.assign({}, statement, { transactions }),
      found: true,
    };
  }

  async getStatementByIdWithTransactions(
    request: GetStatementByIdWithTransactionsRequest,
  ): Promise<GetStatementByIdWithTransactionsResponse> {
    const statementId = this.validateStatementId(request.statementId);
    const transactionType =
      request.transactionType === undefined
        ? undefined
        : this.validateTransactionType(request.transactionType);
    const fromDate =
      request.fromDate === undefined
        ? undefined
        : this.validateDateString(request.fromDate, 'fromDate');
    const toDate =
      request.toDate === undefined
        ? undefined
        : this.validateDateString(request.toDate, 'toDate');
    if (fromDate && toDate && fromDate > toDate) {
      throw new BadRequestException('fromDate cannot be after toDate.');
    }
    const shouldPaginate = request.paginate === true;
    const page = shouldPaginate ? (request.page ?? 1) : 1;
    const limit = shouldPaginate ? (request.limit ?? 10) : 10;

    if (!Number.isInteger(page) || page < 1 || page > 2_147_483_647) {
      throw new BadRequestException('page must be a positive integer.');
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new BadRequestException('limit must be between 1 and 100.');
    }

    const statement = await this.statementRepository.findOne({
      where: { id: statementId },
    });
    if (!statement) {
      return {
        statement: null,
        found: false,
        total: 0,
        page,
        limit,
        totalPages: 0,
      };
    }

    const queryBuilder = this.statementTransactionRepository
      .createQueryBuilder('st')
      .where('st.statementId = :statementId', { statementId });

    if (transactionType) {
      queryBuilder.andWhere('st.transactionType = :transactionType', {
        transactionType,
      });
    }
    if (fromDate) {
      queryBuilder.andWhere('st.transactionDate >= :fromDate', {
        fromDate: `${fromDate} 00:00:00`,
      });
    }
    if (toDate) {
      const exclusiveToDate = new Date(`${toDate}T00:00:00.000Z`);
      exclusiveToDate.setUTCDate(exclusiveToDate.getUTCDate() + 1);
      queryBuilder.andWhere('st.transactionDate < :toDate', {
        toDate: `${exclusiveToDate.toISOString().slice(0, 10)} 00:00:00`,
      });
    }

    const total = await queryBuilder.getCount();
    if (shouldPaginate) {
      queryBuilder.skip((page - 1) * limit).take(limit);
    }
    const transactions = await queryBuilder
      .orderBy('st.transactionDate', 'DESC')
      .addOrderBy('st.id', 'DESC')
      .getMany();

    const effectiveLimit = shouldPaginate ? limit : Math.max(total, 1);
    return {
      statement: Object.assign({}, statement, { transactions }),
      found: true,
      total,
      page,
      limit: effectiveLimit,
      totalPages: Math.max(1, Math.ceil(total / effectiveLimit)),
    };
  }

  async getStatementTransactions(request: StatementFilterRequest): Promise<StatementFilterResponse> {
    const accountId = this.validateAccountId(request.accountId);
    const fromDate = this.validateDateString(request.fromDate, 'fromDate');
    const toDate = this.validateDateString(request.toDate, 'toDate');

    if (fromDate > toDate) {
      throw new BadRequestException('fromDate cannot be after toDate.');
    }

    const transactionType = request.transactionType ? this.validateTransactionType(request.transactionType) : undefined;
    const page =
      request.page === undefined || request.page === 0 ? 1 : request.page;
    const limit =
      request.limit === undefined || request.limit === 0 ? 10 : request.limit;
    if (!Number.isInteger(page) || page < 1) {
      throw new BadRequestException('page must be a positive integer.');
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new BadRequestException('limit must be between 1 and 100.');
    }

    const queryBuilder = this.statementTransactionRepository
      .createQueryBuilder('st')
      .innerJoin('statements', 's', 's.id = st.statementId')
      .where('s.accountId = :accountId', { accountId })
      .andWhere('DATE(st.transactionDate) >= :fromDate', { fromDate })
      .andWhere('DATE(st.transactionDate) <= :toDate', { toDate });

    if (transactionType) {
      queryBuilder.andWhere('st.transactionType = :transactionType', { transactionType });
    }

    const total = await queryBuilder.getCount();
    const items = await queryBuilder
      .orderBy('st.transactionDate', 'DESC')
      .addOrderBy('st.id', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    return {
      transactions: items,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async exportStatementCsv(statementId: number): Promise<StatementFileResponse> {
    const response = await this.getStatement(statementId);
    if (!response.found || !response.statement) {
      throw new NotFoundException(`Statement ${statementId} was not found.`);
    }

    const header = ['Date', 'Reference', 'Description', 'Credit', 'Debit', 'Balance'];
    const rows = (response.statement.transactions ?? []).map((transaction) => {
      const amount = this.toDecimalString(this.getTransactionAmountForCsv(transaction));
      const credit = transaction.transactionType === 'CREDIT' ? amount : '0.00';
      const debit = transaction.transactionType === 'DEBIT' ? amount : '0.00';
      return [
        this.formatExportDate(transaction.transactionDate),
        transaction.isAccountOpening
          ? 'ACCOUNT_OPENING'
          : String(transaction.transferId ?? transaction.id ?? ''),
        transaction.description ?? '',
        credit,
        debit,
        transaction.balanceAfter ?? '0.00',
      ];
    });

    const csvRows = [header, ...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');

    return {
      fileName: `statement-${statementId}.csv`,
      contentType: 'text/csv; charset=utf-8',
      content: Buffer.from(csvRows, 'utf8'),
    };
  }

  async exportStatementPdf(statementId: number): Promise<StatementFileResponse> {
    const response = await this.getStatement(statementId);
    if (!response.found || !response.statement) {
      throw new NotFoundException(`Statement ${statementId} was not found.`);
    }

    const { statement } = response;
    const doc = await this.generatePdfDocument(statement);

    return {
      fileName: `statement-${statementId}.pdf`,
      contentType: 'application/pdf',
      content: doc,
    };
  }

  private async generatePdfDocument(statement: StatementRecord): Promise<Buffer> {
    const PDFDocument = require('pdfkit') as typeof import('pdfkit');
    const doc = new PDFDocument({ margin: 40 });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    doc.on('end', () => undefined);

    doc.fontSize(18).text('Statement Summary', { underline: false });
    doc.moveDown();
    doc.fontSize(10).text(`Account ID: ${statement.accountId}`);
    doc.text(`Period: ${statement.fromDate} to ${statement.toDate}`);
    doc.text(`Opening Balance: ${statement.openingBalance ?? '0.00'}`);
    doc.text(`Closing Balance: ${statement.closingBalance ?? '0.00'}`);
    doc.text(`Generated At: ${statement.generatedAt ? new Date(statement.generatedAt).toISOString() : 'N/A'}`);
    doc.moveDown();

    doc.fontSize(12).text('Transactions', { underline: true });
    doc.moveDown(0.5);

    const transactions = statement.transactions ?? [];
    if (transactions.length === 0) {
      doc.text('No transactions recorded for this statement period.');
    } else {
      doc.fontSize(9);
      transactions.forEach((transaction) => {
        const credit = transaction.transactionType === 'CREDIT' ? transaction.amount ?? '0.00' : '0.00';
        const debit = transaction.transactionType === 'DEBIT' ? transaction.amount ?? '0.00' : '0.00';
        doc.text(
          `${this.formatExportDate(transaction.transactionDate)} | ${transaction.isAccountOpening ? 'ACCOUNT_OPENING' : transaction.transferId} | ${transaction.description ?? 'Transfer'} | ${credit} | ${debit} | ${transaction.balanceAfter ?? '0.00'}`,
        );
      });
    }

    doc.end();

    await new Promise<void>((resolve) => {
      doc.on('end', () => resolve());
    });

    return Buffer.concat(chunks);
  }

  private getTransactionAmount(
    transaction: Partial<StatementTransactionRecord | BankingTransaction>,
  ): string {
    const transactionWithAmount = transaction as BankingTransaction;
    if (transactionWithAmount.amount !== undefined && transactionWithAmount.amount !== null) {
      return this.toDecimalString(transactionWithAmount.amount);
    }
    if (transactionWithAmount.credit !== undefined && transactionWithAmount.credit !== null && transactionWithAmount.credit !== '') {
      return this.toDecimalString(transactionWithAmount.credit);
    }
    if (transactionWithAmount.debit !== undefined && transactionWithAmount.debit !== null && transactionWithAmount.debit !== '') {
      return this.toDecimalString(transactionWithAmount.debit);
    }
    return '0.00';
  }

  private getTransactionAmountForCsv(transaction: StatementTransactionRecord): string {
    const numeric = this.toDecimalString(transaction.amount ?? '0.00');
    return transaction.transactionType === 'DEBIT' ? numeric : numeric;
  }

  private toDecimalString(value: bigint | number | string): string {
    const cents = this.toCents(value);
    const sign = cents < 0n ? '-' : '';
    const absolute = cents < 0n ? -cents : cents;
    const whole = absolute / 100n;
    const fraction = absolute % 100n;
    return `${sign}${whole.toString()}.${fraction.toString().padStart(2, '0')}`;
  }

  private toCents(value: bigint | number | string): bigint {
    if (typeof value === 'bigint') {
      return value;
    }
    const stringValue = String(value ?? '0').trim();
    if (!stringValue || stringValue === 'null' || stringValue === 'undefined') {
      return 0n;
    }
    const clean = stringValue.replace(/[^0-9.-]/g, '');
    const sign = clean.startsWith('-') ? -1n : 1n;
    const normalized = clean.replace(/^-/, '');
    const [whole = '0', fractional = ''] = normalized.split('.');
    const fraction = `${fractional}00`.slice(0, 2);
    const parsed = BigInt(whole || '0') * 100n + BigInt(fraction || '0');
    return sign * parsed;
  }

  private parseDateTime(value: string | Date | undefined): Date | null {
    if (!value) {
      return null;
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private formatExportDate(value: Date | null | undefined): string {
    if (!value) {
      return '';
    }
    return new Date(value).toISOString().slice(0, 10);
  }

  private validateAccountId(accountId: number): number {
    if (!Number.isInteger(accountId) || accountId <= 0) {
      throw new BadRequestException('accountId must be a positive integer.');
    }
    return accountId;
  }

  private validateStatementId(statementId: number): number {
    if (!Number.isInteger(statementId) || statementId <= 0) {
      throw new BadRequestException('statementId must be a positive integer.');
    }
    return statementId;
  }

  private validateDateString(value: string, field: 'fromDate' | 'toDate'): string {
    if (!value || typeof value !== 'string') {
      throw new BadRequestException(`${field} is required.`);
    }
    const regex = /^\d{4}-\d{2}-\d{2}$/;
    if (!regex.test(value)) {
      throw new BadRequestException(`${field} must be in YYYY-MM-DD format.`);
    }
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (
      Number.isNaN(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== value
    ) {
      throw new BadRequestException(`${field} is not a valid date.`);
    }
    return value;
  }

  private validateTransactionType(value: string): 'CREDIT' | 'DEBIT' {
    const normalized = value.toUpperCase();
    if (normalized === 'CREDIT' || normalized === 'DEBIT') {
      return normalized;
    }
    throw new BadRequestException('transactionType must be either CREDIT or DEBIT.');
  }

  private resolveTransactionType(transaction: BankingTransaction): 'CREDIT' | 'DEBIT' {
    const source = (transaction.transactionType ?? transaction.type ?? transaction.direction ?? '').toString().toUpperCase();
    if (source === 'DEBIT' || source === 'OUT' || source === 'WITHDRAWAL' || source === 'TRANSFER_OUT') {
      return 'DEBIT';
    }
    return 'CREDIT';
  }
}
