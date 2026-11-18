import { Module } from '@nestjs/common';
import { GrpcClientsModule } from '../grpc/grpc-clients.module.js';
import { StatementsController } from './statements.controller.js';
import { StatementsService } from './statements.service.js';

@Module({
  imports: [GrpcClientsModule],
  controllers: [StatementsController],
  providers: [StatementsService],
})
export class StatementsModule {}
