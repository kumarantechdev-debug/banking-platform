import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddPasswordHashToCustomers1794920000000 implements MigrationInterface {
  name = 'AddPasswordHashToCustomers1794920000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'customers',
      new TableColumn({
        name: 'password_hash',
        type: 'varchar',
        length: '255',
        isNullable: true,
      }),
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('customers', 'password_hash');
  }
}
