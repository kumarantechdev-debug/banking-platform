import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'settlement_audit_logs' })
@Index(['jobId'])
@Index(['transferId'])
@Index(['createdAt'])
export class SettlementAuditLog {
  @PrimaryGeneratedColumn({ type: 'int' })
  id!: number;

  @Column({ type: 'int', nullable: false })
  jobId!: number;

  @Column({ type: 'int', nullable: true })
  transferId?: number | null;

  @Column({ type: 'varchar', length: 50, nullable: false })
  action!: string;

  @Column({ type: 'varchar', length: 20, nullable: false })
  status!: string;

  @Column({ type: 'text', nullable: false })
  description!: string;

  @Column({ type: 'text', nullable: true })
  errorMessage?: string | null;

  @Column({ type: 'text', nullable: true })
  errorDetails?: string | null;

  @CreateDateColumn({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;
}
