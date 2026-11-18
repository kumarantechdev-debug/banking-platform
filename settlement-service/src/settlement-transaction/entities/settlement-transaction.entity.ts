import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'settlement_transactions' })
@Unique(['transferId'])
@Index(['status'])
@Index(['transferId'])
@Index(['jobId'])
@Index(['nextRetryAt'])
export class SettlementTransaction {
  @PrimaryGeneratedColumn({ type: 'int' })
  id!: number;

  @Column({ type: 'int', nullable: true })
  jobId?: number | null;

  @Column({ type: 'int', nullable: false })
  transferId!: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: false })
  amount!: string;

  @Column({ type: 'varchar', length: 20, nullable: false, default: 'PENDING' })
  status!: string;

  @Column({ type: 'int', default: 0 })
  retryCount!: number;

  @Column({ type: 'text', nullable: true })
  errorMessage?: string | null;

  @Column({ type: 'datetime', nullable: true })
  nextRetryAt?: Date | null;

  @Column({ type: 'datetime', nullable: true })
  processedAt?: Date | null;

  @CreateDateColumn({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt!: Date;
}
