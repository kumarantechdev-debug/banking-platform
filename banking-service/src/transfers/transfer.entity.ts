import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { Account } from '../accounts/account.entity';
import { TransferAudit } from './transfer-audit.entity';

export enum TransferStatus {
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
}

export enum TransferSettlementStatus {
  PENDING = 'PENDING',
  SETTLED = 'SETTLED',
}

@Entity({ name: 'transfers' })
@Index('UQ_transfers_reference_number', ['referenceNumber'], { unique: true })
@Index('UQ_transfers_idempotency_key', ['idempotencyKey'], { unique: true })
@Index('IDX_transfers_from_account_id', ['fromAccountId'])
@Index('IDX_transfers_to_account_id', ['toAccountId'])
@Index('IDX_transfers_created_at', ['createdAt'])
@Index('IDX_transfers_settlement_status_created_at', ['settlementStatus', 'createdAt'])
export class Transfer {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 50 })
  referenceNumber!: string;

  @Column({ type: 'int', name: 'fromAccountId' })
  fromAccountId!: number;

  @ManyToOne(() => Account, (account) => account.outgoingTransfers, {
    nullable: false,
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({
    name: 'fromAccountId',
    foreignKeyConstraintName: 'FK_transfers_from_account',
  })
  fromAccount!: Relation<Account>;

  @Column({ type: 'int', name: 'toAccountId' })
  toAccountId!: number;

  @ManyToOne(() => Account, (account) => account.incomingTransfers, {
    nullable: false,
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({
    name: 'toAccountId',
    foreignKeyConstraintName: 'FK_transfers_to_account',
  })
  toAccount!: Relation<Account>;

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

  @Column({ type: 'varchar', length: 20 })
  status!: TransferStatus;

  @Column({
    type: 'varchar',
    length: 20,
    default: TransferSettlementStatus.PENDING,
  })
  settlementStatus!: TransferSettlementStatus;

  @Column({ type: 'varchar', length: 100 })
  idempotencyKey!: string;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt!: Date;

  @OneToMany(() => TransferAudit, (audit) => audit.transfer)
  audits!: Relation<TransferAudit[]>;
}
