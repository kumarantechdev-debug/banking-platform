import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAccountOpeningTransactions1720000000000
  implements MigrationInterface
{
  name = 'AddAccountOpeningTransactions1720000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE statement_transactions
        MODIFY transferId INT NULL,
        ADD COLUMN isAccountOpening BOOLEAN NOT NULL DEFAULT FALSE
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const rows = (await queryRunner.query(
      `SELECT COUNT(*) AS count
       FROM statement_transactions
       WHERE isAccountOpening = TRUE`,
    )) as Array<{ count: number | string }>;
    if (Number(rows[0]?.count ?? 0) > 0) {
      throw new Error(
        'Cannot revert account-opening statements while account-opening transactions exist.',
      );
    }

    await queryRunner.query(`
      ALTER TABLE statement_transactions
        DROP COLUMN isAccountOpening,
        MODIFY transferId INT NOT NULL
    `);
  }
}
