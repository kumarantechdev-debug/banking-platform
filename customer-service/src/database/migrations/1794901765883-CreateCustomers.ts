import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCustomers1794901765883 implements MigrationInterface {
  name = 'CreateCustomers1794901765883';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`customers\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`name\` varchar(150) NOT NULL,
        \`mobile\` varchar(15) NOT NULL,
        \`city\` varchar(100) NOT NULL,
        \`state\` varchar(100) NOT NULL,
        \`status\` varchar(20) NOT NULL DEFAULT 'ACTIVE',
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        INDEX \`IDX_customers_name\` (\`name\`),
        INDEX \`IDX_customers_city\` (\`city\`),
        INDEX \`IDX_customers_state\` (\`state\`),
        INDEX \`IDX_customers_status\` (\`status\`),
        UNIQUE INDEX \`IDX_6d1cb2e8c3ca15f7293464edad\` (\`mobile\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `customers`');
  }
}
