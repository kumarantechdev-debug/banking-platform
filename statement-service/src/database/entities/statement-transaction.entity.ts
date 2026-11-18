import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { Statement } from './statement.entity';

@Entity({ name: 'statement_transactions' })
export class StatementTransaction {
  @PrimaryGeneratedColumn({ type: 'int' })
  id: number;

  @Index()
  @Column({ type: 'int', nullable: false })
  statementId: number;

  @Index()
  @Column({ type: 'int', nullable: true })
  transferId: number | null;

  @Column({ type: 'boolean', default: false })
  isAccountOpening: boolean;

  @Index()
  @Column({ type: 'datetime', nullable: true })
  transactionDate: Date | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  transactionType: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  amount: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  balanceAfter: string | null;

  @ManyToOne(() => Statement, (statement) => statement.transactions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'statementId' })
  statement: Relation<Statement>;
}
