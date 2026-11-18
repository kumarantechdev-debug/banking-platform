import { MigrationInterface, QueryRunner } from 'typeorm';

export class AlignBankingSchema1794930000000 implements MigrationInterface {
  name = 'AlignBankingSchema1794930000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const oversizedAccounts = await queryRunner.query(
      'SELECT COUNT(*) AS count FROM accounts WHERE CHAR_LENGTH(accountNumber) > 30',
    );
    const oversizedIdempotencyKeys = await queryRunner.query(
      'SELECT COUNT(*) AS count FROM transfers WHERE CHAR_LENGTH(idempotencyKey) > 100',
    );
    if (
      Number(oversizedAccounts[0]?.count) > 0 ||
      Number(oversizedIdempotencyKeys[0]?.count) > 0
    ) {
      throw new Error(
        'Existing account numbers or idempotency keys exceed the new column limits; no schema changes were applied.',
      );
    }

    await queryRunner.query(`
      ALTER TABLE accounts
        MODIFY accountNumber VARCHAR(30) NOT NULL,
        MODIFY status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
        ADD INDEX IDX_accounts_status (status)
    `);

    await queryRunner.query(`
      ALTER TABLE transfers
        MODIFY referenceNumber VARCHAR(50) NOT NULL,
        MODIFY status VARCHAR(20) NOT NULL,
        MODIFY idempotencyKey VARCHAR(100) NOT NULL,
        ADD INDEX IDX_transfers_created_at (createdAt)
    `);

    await queryRunner.query(`
      ALTER TABLE transfer_audits
        MODIFY status VARCHAR(20) NOT NULL,
        MODIFY action VARCHAR(50) NOT NULL,
        MODIFY description TEXT NULL,
        DROP INDEX IDX_transfer_audits_transfer_id,
        ADD INDEX IDX_transfer_audit_transfer_id (transferId),
        ADD INDEX IDX_transfer_audit_created_at (createdAt)
    `);
    await queryRunner.query('RENAME TABLE transfer_audits TO transfer_audit');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const oversizedDescriptions = await queryRunner.query(
      'SELECT COUNT(*) AS count FROM transfer_audit WHERE description IS NULL OR CHAR_LENGTH(description) > 255',
    );
    if (Number(oversizedDescriptions[0]?.count) > 0) {
      throw new Error(
        'Existing transfer audit descriptions exceed VARCHAR(255); no rollback changes were applied.',
      );
    }

    await queryRunner.query('RENAME TABLE transfer_audit TO transfer_audits');
    await queryRunner.query(`
      ALTER TABLE transfer_audits
        MODIFY status ENUM('SUCCESS', 'FAILED') NOT NULL,
        MODIFY action ENUM('INITIATED', 'COMPLETED', 'FAILED') NOT NULL,
        MODIFY description VARCHAR(255) NOT NULL,
        DROP INDEX IDX_transfer_audit_transfer_id,
        DROP INDEX IDX_transfer_audit_created_at,
        ADD INDEX IDX_transfer_audits_transfer_id (transferId)
    `);

    await queryRunner.query(`
      ALTER TABLE transfers
        MODIFY referenceNumber VARCHAR(40) NOT NULL,
        MODIFY status ENUM('SUCCESS', 'FAILED') NOT NULL,
        MODIFY idempotencyKey VARCHAR(128) NOT NULL,
        DROP INDEX IDX_transfers_created_at
    `);

    await queryRunner.query(`
      ALTER TABLE accounts
        MODIFY accountNumber VARCHAR(32) NOT NULL,
        MODIFY status ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
        DROP INDEX IDX_accounts_status
    `);
  }
}
