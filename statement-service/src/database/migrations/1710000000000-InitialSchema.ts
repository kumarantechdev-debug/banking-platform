import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1710000000000 implements MigrationInterface {
  name = 'InitialSchema1710000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE statements (
        id INT NOT NULL AUTO_INCREMENT,
        accountId INT NOT NULL,
        fromDate DATE NOT NULL,
        toDate DATE NOT NULL,
        openingBalance DECIMAL(15,2) NULL,
        closingBalance DECIMAL(15,2) NULL,
        generatedAt DATETIME NULL,
        status VARCHAR(20) NULL,
        PRIMARY KEY (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      CREATE TABLE statement_transactions (
        id INT NOT NULL AUTO_INCREMENT,
        statementId INT NOT NULL,
        transferId INT NOT NULL,
        transactionDate DATETIME NULL,
        transactionType VARCHAR(20) NULL,
        amount DECIMAL(15,2) NULL,
        description TEXT NULL,
        balanceAfter DECIMAL(15,2) NULL,
        PRIMARY KEY (id),
        CONSTRAINT FK_statement_transactions_statementId
          FOREIGN KEY (statementId) REFERENCES statements (id)
          ON DELETE CASCADE
          ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`
      CREATE INDEX IDX_statements_accountId ON statements (accountId);
    `);
    await queryRunner.query(`
      CREATE INDEX IDX_statements_fromDate ON statements (fromDate);
    `);
    await queryRunner.query(`
      CREATE INDEX IDX_statements_toDate ON statements (toDate);
    `);
    await queryRunner.query(`
      CREATE INDEX IDX_statements_status ON statements (status);
    `);
    await queryRunner.query(`
      CREATE INDEX IDX_statement_transactions_statementId ON statement_transactions (statementId);
    `);
    await queryRunner.query(`
      CREATE INDEX IDX_statement_transactions_transferId ON statement_transactions (transferId);
    `);
    await queryRunner.query(`
      CREATE INDEX IDX_statement_transactions_transactionDate ON statement_transactions (transactionDate);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS statement_transactions;`);
    await queryRunner.query(`DROP TABLE IF EXISTS statements;`);
  }
}
