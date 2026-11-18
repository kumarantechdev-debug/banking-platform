import { MigrationInterface, QueryRunner, Table, TableIndex, TableUnique } from 'typeorm';

export class SettlementTransactions1710000000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'settlement_transactions',
        columns: [
          {
            name: 'id',
            type: 'int',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          {
            name: 'jobId',
            type: 'int',
            isNullable: true,
          },
          {
            name: 'transferId',
            type: 'int',
            isNullable: false,
          },
          {
            name: 'amount',
            type: 'decimal',
            precision: 15,
            scale: 2,
            isNullable: false,
          },
          {
            name: 'status',
            type: 'varchar',
            length: '20',
            isNullable: false,
            default: `'PENDING'`,
          },
          {
            name: 'retryCount',
            type: 'int',
            default: 0,
          },
          {
            name: 'errorMessage',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'nextRetryAt',
            type: 'datetime',
            isNullable: true,
          },
          {
            name: 'processedAt',
            type: 'datetime',
            isNullable: true,
          },
          {
            name: 'createdAt',
            type: 'datetime',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updatedAt',
            type: 'datetime',
            default: 'CURRENT_TIMESTAMP',
            onUpdate: 'CURRENT_TIMESTAMP',
          },
        ],
        uniques: [
          new TableUnique({
            name: 'UQ_SETTLEMENT_TRANSFER_ID',
            columnNames: ['transferId'],
          }),
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'settlement_transactions',
      new TableIndex({
        name: 'IDX_SETTLEMENT_TRANSACTION_STATUS',
        columnNames: ['status'],
      }),
    );

    await queryRunner.createIndex(
      'settlement_transactions',
      new TableIndex({
        name: 'IDX_SETTLEMENT_TRANSACTION_TRANSFER_ID',
        columnNames: ['transferId'],
      }),
    );

    await queryRunner.createIndex(
      'settlement_transactions',
      new TableIndex({
        name: 'IDX_SETTLEMENT_TRANSACTION_JOB_ID',
        columnNames: ['jobId'],
      }),
    );

    await queryRunner.createIndex(
      'settlement_transactions',
      new TableIndex({
        name: 'IDX_SETTLEMENT_TRANSACTION_NEXT_RETRY_AT',
        columnNames: ['nextRetryAt'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('settlement_transactions', true);
  }
}
