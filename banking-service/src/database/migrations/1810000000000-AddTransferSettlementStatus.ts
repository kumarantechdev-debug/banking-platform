import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTransferSettlementStatus1810000000000
  implements MigrationInterface
{
  name = 'AddTransferSettlementStatus1810000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE transfers
        ADD settlementStatus VARCHAR(20) NOT NULL DEFAULT 'PENDING',
        ADD INDEX IDX_transfers_settlement_status_created_at
          (settlementStatus, createdAt)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE transfers
        DROP INDEX IDX_transfers_settlement_status_created_at,
        DROP COLUMN settlementStatus
    `);
  }
}
