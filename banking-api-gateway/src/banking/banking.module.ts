import { Module } from '@nestjs/common';
import { GrpcClientsModule } from '../grpc/grpc-clients.module.js';
import { AccountsController, TransfersController } from './banking.controller.js';
import { BankingService } from './banking.service.js';

@Module({
  imports: [GrpcClientsModule],
  controllers: [AccountsController, TransfersController],
  providers: [BankingService],
})
export class BankingModule {}
