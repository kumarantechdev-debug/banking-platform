import { Column, Entity, Index, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import type { Relation } from 'typeorm';
import { StatementTransaction } from './statement-transaction.entity';

@Entity({ name: 'statements' })
export class Statement {
  @PrimaryGeneratedColumn({ type: 'int' })
  id: number;

  @Index()
  @Column({ type: 'int', nullable: false })
  accountId: number;

  @Index()
  @Column({ type: 'date', nullable: false })
  fromDate: string;

  @Index()
  @Column({ type: 'date', nullable: false })
  toDate: string;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  openingBalance: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  closingBalance: string | null;

  @Column({ type: 'datetime', nullable: true })
  generatedAt: Date | null;

  @Index()
  @Column({ type: 'varchar', length: 20, nullable: true })
  status: string | null;

  @OneToMany(() => StatementTransaction, (transaction) => transaction.statement)
  transactions?: Relation<StatementTransaction[]>;
}
