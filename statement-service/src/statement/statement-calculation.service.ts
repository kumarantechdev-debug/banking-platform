import { Injectable } from '@nestjs/common';
import type { BankingAccount, BankingTransaction } from './statement.types';

@Injectable()
export class StatementCalculationService {
  normalizeTransaction(transaction: BankingTransaction): BankingTransaction {
    const type = this.resolveTransactionType(transaction);
    const amount = this.toDecimalString(this.getAmountValue(transaction));
    return {
      ...transaction,
      transactionType: type,
      type,
      amount,
      credit: type === 'CREDIT' ? amount : '0.00',
      debit: type === 'DEBIT' ? amount : '0.00',
      description: transaction.description ?? 'Transfer',
    };
  }

  sortTransactions(transactions: BankingTransaction[]): BankingTransaction[] {
    return [...transactions].sort((left, right) => {
      const leftDate = new Date(this.toDateValue(left.transactionDate)).getTime();
      const rightDate = new Date(this.toDateValue(right.transactionDate)).getTime();

      if (leftDate !== rightDate) {
        return leftDate - rightDate;
      }

      const leftId = Number(left.transferId ?? left.id ?? 0);
      const rightId = Number(right.transferId ?? right.id ?? 0);
      return leftId - rightId;
    });
  }

  calculateOpeningBalance(account: BankingAccount, transactions: BankingTransaction[]): string {
    const cash = this.getAccountBalanceValue(account);
    const netRange = this.calculateNetAmount(transactions);
    const opening = this.safeDecimalSubtract(cash, netRange);
    return this.toDecimalString(opening);
  }

  calculateClosingBalance(openingBalance: string, transactions: BankingTransaction[]): string {
    const base = this.toCents(openingBalance);
    const running = transactions.reduce((sum, transaction) => {
      const signed = this.getSignedAmount(transaction);
      return sum + signed;
    }, base);
    return this.toDecimalString(running);
  }

  getSignedAmount(transaction: BankingTransaction): bigint {
    const amount = this.toCents(this.getAmountValue(transaction));
    const type = this.resolveTransactionType(transaction);
    return type === 'DEBIT' ? -amount : amount;
  }

  createBalanceAfter(openingBalance: string, transactions: BankingTransaction[]): BankingTransaction[] {
    const sorted = this.sortTransactions(transactions);
    let running = this.toCents(openingBalance);

    return sorted.map((transaction) => {
      const signed = this.getSignedAmount(transaction);
      running += signed;
      return {
        ...transaction,
        balanceAfter: this.toDecimalString(running),
      };
    });
  }

  getAccountBalanceValue(account: BankingAccount): string {
    if (account.currentBalance !== undefined && account.currentBalance !== null && account.currentBalance !== '') {
      return this.toDecimalString(account.currentBalance);
    }
    if (account.balance !== undefined && account.balance !== null && account.balance !== '') {
      return this.toDecimalString(account.balance);
    }
    if (account.availableBalance !== undefined && account.availableBalance !== null && account.availableBalance !== '') {
      return this.toDecimalString(account.availableBalance);
    }
    if (account.openingBalance !== undefined && account.openingBalance !== null && account.openingBalance !== '') {
      return this.toDecimalString(account.openingBalance);
    }
    return '0.00';
  }

  private resolveTransactionType(transaction: BankingTransaction): 'CREDIT' | 'DEBIT' {
    const source = (transaction.transactionType ?? transaction.type ?? transaction.direction ?? '').toString().toUpperCase();
    if (source === 'DEBIT' || source === 'OUT' || source === 'WITHDRAWAL' || source === 'TRANSFER_OUT') {
      return 'DEBIT';
    }
    return 'CREDIT';
  }

  private calculateNetAmount(transactions: BankingTransaction[]): string {
    const total = transactions.reduce((sum, transaction) => {
      const signed = this.getSignedAmount(transaction);
      return sum + signed;
    }, 0n);
    return this.toDecimalString(total);
  }

  private safeDecimalSubtract(left: number | string, right: number | string): string {
    const leftValue = this.toCents(left);
    const rightValue = this.toCents(right);
    return this.toDecimalString(leftValue - rightValue);
  }

  private getAmountValue(transaction: BankingTransaction): number | string {
    const explicitAmount = transaction.amount ?? transaction.credit ?? transaction.debit ?? 0;
    if (transaction.transactionType?.toUpperCase() === 'DEBIT' && transaction.debit !== undefined && transaction.debit !== null && transaction.debit !== '') {
      return transaction.debit;
    }
    if (transaction.transactionType?.toUpperCase() === 'CREDIT' && transaction.credit !== undefined && transaction.credit !== null && transaction.credit !== '') {
      return transaction.credit;
    }
    return explicitAmount;
  }

  private toDateValue(value: string | Date | undefined): string {
    if (!value) {
      return new Date(0).toISOString();
    }
    if (value instanceof Date) {
      return value.toISOString();
    }
    return new Date(value).toISOString();
  }

  private toDecimalString(value: bigint | number | string): string {
    const cents = this.toCents(value);
    const sign = cents < 0n ? '-' : '';
    const absolute = cents < 0n ? -cents : cents;
    const whole = absolute / 100n;
    const fractional = absolute % 100n;
    return `${sign}${whole.toString()}.${fractional.toString().padStart(2, '0')}`;
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
}
