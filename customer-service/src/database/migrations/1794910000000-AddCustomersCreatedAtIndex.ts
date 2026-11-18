import { MigrationInterface, QueryRunner, TableIndex } from 'typeorm';

export class AddCustomersCreatedAtIndex1794910000000 implements MigrationInterface {
  name = 'AddCustomersCreatedAtIndex1794910000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createIndex(
      'customers',
      new TableIndex({
        name: 'IDX_customers_createdAt',
        columnNames: ['createdAt'],
      }),
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex('customers', 'IDX_customers_createdAt');
  }
}
