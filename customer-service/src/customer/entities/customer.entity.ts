import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'customers' })
@Index('IDX_customers_name', ['name'])
@Index('IDX_customers_city', ['city'])
@Index('IDX_customers_state', ['state'])
@Index('IDX_customers_status', ['status'])
@Index('IDX_customers_createdAt', ['createdAt'])
export class Customer {
  @PrimaryGeneratedColumn({ type: 'int' })
  id!: number;

  @Column({ type: 'varchar', length: 150, nullable: false })
  name!: string;

  @Column({ type: 'varchar', length: 15, nullable: false, unique: true })
  mobile!: string;

  @Column({
    name: 'password_hash',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  passwordHash!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: false })
  city!: string;

  @Column({ type: 'varchar', length: 100, nullable: false })
  state!: string;

  @Column({ type: 'varchar', length: 20, nullable: false, default: 'ACTIVE' })
  status!: 'ACTIVE' | 'INACTIVE';

  @CreateDateColumn({ type: 'datetime' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt!: Date;
}
