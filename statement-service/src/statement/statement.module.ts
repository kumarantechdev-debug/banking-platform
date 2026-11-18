import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Statement } from '../database/entities/statement.entity';
import { StatementTransaction } from '../database/entities/statement-transaction.entity';
import { BankingGrpcClient } from '../banking/banking-grpc.client';
import { StatementCalculationService } from './statement-calculation.service';
import { StatementService } from './statement.service';
import { StatementGrpcService } from './statement.grpc.service';

@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([Statement, StatementTransaction])],
  controllers: [StatementGrpcService],
  providers: [BankingGrpcClient, StatementCalculationService, StatementService],
  exports: [StatementService],
})
export class StatementModule {}
