import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class SettlementAuditLogs1710000000002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'settlement_audit_logs',
        columns: [
          {
            name: 'id',
            type: 'int',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          { name: 'jobId', type: 'int', isNullable: false },
          { name: 'transferId', type: 'int', isNullable: true },
          { name: 'action', type: 'varchar', length: '50', isNullable: false },
          { name: 'status', type: 'varchar', length: '20', isNullable: false },
          { name: 'description', type: 'text', isNullable: false },
          { name: 'errorMessage', type: 'text', isNullable: true },
          { name: 'errorDetails', type: 'text', isNullable: true },
          {
            name: 'createdAt',
            type: 'datetime',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'settlement_audit_logs',
      new TableIndex({ name: 'IDX_SETTLEMENT_AUDIT_JOB_ID', columnNames: ['jobId'] }),
    );
    await queryRunner.createIndex(
      'settlement_audit_logs',
      new TableIndex({ name: 'IDX_SETTLEMENT_AUDIT_TRANSFER_ID', columnNames: ['transferId'] }),
    );
    await queryRunner.createIndex(
      'settlement_audit_logs',
      new TableIndex({ name: 'IDX_SETTLEMENT_AUDIT_CREATED_AT', columnNames: ['createdAt'] }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('settlement_audit_logs', true);
  }
}
