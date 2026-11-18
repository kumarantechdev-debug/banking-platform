import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBalanceLedger1800000000000 implements MigrationInterface {
  name = 'CreateBalanceLedger1800000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE account_balance_ledger (
        id INT NOT NULL AUTO_INCREMENT,
        accountId INT NOT NULL,
        transferId INT NULL,
        entryType VARCHAR(20) NOT NULL,
        transactionType VARCHAR(10) NULL,
        referenceNumber VARCHAR(50) NULL,
        amount DECIMAL(15,2) NOT NULL,
        balanceAfter DECIMAL(15,2) NOT NULL,
        effectiveAt DATETIME(6) NOT NULL,
        description TEXT NOT NULL,
        PRIMARY KEY (id),
        INDEX IDX_balance_ledger_account_effective_id (accountId, effectiveAt, id),
        INDEX IDX_balance_ledger_transfer_id (transferId),
        CONSTRAINT FK_balance_ledger_account
          FOREIGN KEY (accountId) REFERENCES accounts (id)
          ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT FK_balance_ledger_transfer
          FOREIGN KEY (transferId) REFERENCES transfers (id)
          ON DELETE RESTRICT ON UPDATE CASCADE
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      INSERT INTO account_balance_ledger
        (accountId, transferId, entryType, transactionType, referenceNumber,
         amount, balanceAfter, effectiveAt, description)
      SELECT id, NULL, 'BASELINE', NULL, NULL, balance, balance, NOW(6),
             'Opening balance snapshot at ledger activation'
      FROM accounts
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS account_balance_ledger');
  }
}
