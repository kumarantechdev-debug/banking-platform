import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

@Entity({ name: 'settlement_jobs' })
@Unique(['jobDate'])
@Index(['jobDate'])
@Index(['status'])
export class SettlementJob {
  @PrimaryGeneratedColumn({ type: 'int' })
  id!: number;

  @Column({ type: 'date', nullable: false })
  jobDate!: Date | string;

  @Column({ type: 'varchar', length: 20, nullable: false, default: 'PENDING' })
  status!: string;

  @Column({ type: 'int', default: 0 })
  totalTransactions!: number;

  @Column({ type: 'int', default: 0 })
  successfulTransactions!: number;

  @Column({ type: 'int', default: 0 })
  failedTransactions!: number;

  @Column({ type: 'datetime', nullable: true })
  startedAt?: Date | null;

  @Column({ type: 'datetime', nullable: true })
  completedAt?: Date | null;

  @CreateDateColumn({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;
}
