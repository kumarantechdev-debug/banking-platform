import { MigrationInterface, QueryRunner, Table, TableIndex, TableUnique } from 'typeorm';

export class SettlementJobs1710000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'settlement_jobs',
        columns: [
          {
            name: 'id',
            type: 'int',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          {
            name: 'jobDate',
            type: 'date',
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
            name: 'totalTransactions',
            type: 'int',
            default: 0,
          },
          {
            name: 'successfulTransactions',
            type: 'int',
            default: 0,
          },
          {
            name: 'failedTransactions',
            type: 'int',
            default: 0,
          },
          {
            name: 'startedAt',
            type: 'datetime',
            isNullable: true,
          },
          {
            name: 'completedAt',
            type: 'datetime',
            isNullable: true,
          },
          {
            name: 'createdAt',
            type: 'datetime',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
        uniques: [
          new TableUnique({
            name: 'UQ_SETTLEMENT_JOB_DATE',
            columnNames: ['jobDate'],
          }),
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'settlement_jobs',
      new TableIndex({
        name: 'IDX_SETTLEMENT_JOB_DATE',
        columnNames: ['jobDate'],
      }),
    );

    await queryRunner.createIndex(
      'settlement_jobs',
      new TableIndex({
        name: 'IDX_SETTLEMENT_JOB_STATUS',
        columnNames: ['status'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('settlement_jobs', true);
  }
}
