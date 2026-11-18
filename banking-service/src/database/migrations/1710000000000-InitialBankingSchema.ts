import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialBankingSchema1710000000000 implements MigrationInterface {
  name = 'InitialBankingSchema1710000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE accounts (
        id INT NOT NULL AUTO_INCREMENT,
        accountNumber VARCHAR(32) NOT NULL,
        customerId INT NOT NULL,
        balance DECIMAL(15,2) NOT NULL DEFAULT 0.00,
        status ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
        createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updatedAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        UNIQUE INDEX UQ_accounts_account_number (accountNumber),
        INDEX IDX_accounts_customer_id (customerId),
        PRIMARY KEY (id)
      ) ENGINE=InnoDB
    `);
    await queryRunner.query(`
      CREATE TABLE transfers (
        id INT NOT NULL AUTO_INCREMENT,
        referenceNumber VARCHAR(40) NOT NULL,
        fromAccountId INT NOT NULL,
        toAccountId INT NOT NULL,
        amount DECIMAL(15,2) NOT NULL,
        status ENUM('SUCCESS', 'FAILED') NOT NULL,
        idempotencyKey VARCHAR(128) NOT NULL,
        createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        UNIQUE INDEX UQ_transfers_reference_number (referenceNumber),
        UNIQUE INDEX UQ_transfers_idempotency_key (idempotencyKey),
        INDEX IDX_transfers_from_account_id (fromAccountId),
        INDEX IDX_transfers_to_account_id (toAccountId),
        PRIMARY KEY (id),
        CONSTRAINT FK_transfers_from_account FOREIGN KEY (fromAccountId)
          REFERENCES accounts(id) ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT FK_transfers_to_account FOREIGN KEY (toAccountId)
          REFERENCES accounts(id) ON DELETE RESTRICT ON UPDATE CASCADE
      ) ENGINE=InnoDB
    `);
    await queryRunner.query(`
      CREATE TABLE transfer_audits (
        id INT NOT NULL AUTO_INCREMENT,
        transferId INT NOT NULL,
        fromAccountId INT NOT NULL,
        toAccountId INT NOT NULL,
        amount DECIMAL(15,2) NOT NULL,
        status ENUM('SUCCESS', 'FAILED') NOT NULL,
        action ENUM('INITIATED', 'COMPLETED', 'FAILED') NOT NULL,
        description VARCHAR(255) NOT NULL,
        createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        INDEX IDX_transfer_audits_transfer_id (transferId),
        PRIMARY KEY (id),
        CONSTRAINT FK_transfer_audits_transfer FOREIGN KEY (transferId)
          REFERENCES transfers(id) ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT FK_transfer_audits_from_account FOREIGN KEY (fromAccountId)
          REFERENCES accounts(id) ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT FK_transfer_audits_to_account FOREIGN KEY (toAccountId)
          REFERENCES accounts(id) ON DELETE RESTRICT ON UPDATE CASCADE
      ) ENGINE=InnoDB
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE transfer_audits');
    await queryRunner.query('DROP TABLE transfers');
    await queryRunner.query('DROP TABLE accounts');
  }
}
