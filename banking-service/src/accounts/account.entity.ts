import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { Transfer } from '../transfers/transfer.entity';

export enum AccountStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

@Entity({ name: 'accounts' })
@Index('UQ_accounts_account_number', ['accountNumber'], { unique: true })
@Index('IDX_accounts_customer_id', ['customerId'])
@Index('IDX_accounts_status', ['status'])
export class Account {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 30 })
  accountNumber!: string;

  @Column({ type: 'int' })
  customerId!: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    default: 0,
    transformer: {
      to: (value: string) => value,
      from: (value: string | number) => String(value),
    },
  })
  balance!: string;

  @Column({
    type: 'varchar',
    length: 20,
    default: AccountStatus.ACTIVE,
  })
  status!: AccountStatus;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt!: Date;

  @OneToMany(() => Transfer, (transfer) => transfer.fromAccount)
  outgoingTransfers!: Relation<Transfer[]>;

  @OneToMany(() => Transfer, (transfer) => transfer.toAccount)
  incomingTransfers!: Relation<Transfer[]>;
}
