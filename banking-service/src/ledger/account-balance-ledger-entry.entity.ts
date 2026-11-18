import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type AccountBalanceLedgerEntryType =
  | 'BASELINE'
  | 'ACCOUNT_OPENING'
  | 'TRANSFER';
export type AccountBalanceTransactionType = 'CREDIT' | 'DEBIT';

@Entity({ name: 'account_balance_ledger' })
@Index('IDX_balance_ledger_account_effective_id', [
  'accountId',
  'effectiveAt',
  'id',
])
@Index('IDX_balance_ledger_transfer_id', ['transferId'])
export class AccountBalanceLedgerEntry {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  accountId!: number;

  @Column({ type: 'int', nullable: true })
  transferId!: number | null;

  @Column({ type: 'varchar', length: 20 })
  entryType!: AccountBalanceLedgerEntryType;

  @Column({ type: 'varchar', length: 10, nullable: true })
  transactionType!: AccountBalanceTransactionType | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  referenceNumber!: string | null;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    transformer: {
      to: (value: string) => value,
      from: (value: string | number) => String(value),
    },
  })
  amount!: string;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    transformer: {
      to: (value: string) => value,
      from: (value: string | number) => String(value),
    },
  })
  balanceAfter!: string;

  @Column({ type: 'datetime', precision: 6 })
  effectiveAt!: Date;

  @Column({ type: 'text' })
  description!: string;
}
