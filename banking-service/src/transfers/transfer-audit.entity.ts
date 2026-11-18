import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { Transfer, TransferStatus } from './transfer.entity';
import { Account } from '../accounts/account.entity';

export enum TransferAuditAction {
  INITIATED = 'INITIATED',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

@Entity({ name: 'transfer_audit' })
@Index('IDX_transfer_audit_transfer_id', ['transferId'])
@Index('IDX_transfer_audit_created_at', ['createdAt'])
export class TransferAudit {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int', name: 'transferId' })
  transferId!: number;

  @ManyToOne(() => Transfer, (transfer) => transfer.audits, {
    nullable: false,
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({
    name: 'transferId',
    foreignKeyConstraintName: 'FK_transfer_audits_transfer',
  })
  transfer!: Relation<Transfer>;

  @Column({ type: 'int' })
  fromAccountId!: number;

  @ManyToOne(() => Account, {
    nullable: false,
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({
    name: 'fromAccountId',
    foreignKeyConstraintName: 'FK_transfer_audits_from_account',
  })
  fromAccount!: Relation<Account>;

  @Column({ type: 'int' })
  toAccountId!: number;

  @ManyToOne(() => Account, {
    nullable: false,
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({
    name: 'toAccountId',
    foreignKeyConstraintName: 'FK_transfer_audits_to_account',
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

  @Column({ type: 'varchar', length: 50 })
  action!: TransferAuditAction;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt!: Date;
}
