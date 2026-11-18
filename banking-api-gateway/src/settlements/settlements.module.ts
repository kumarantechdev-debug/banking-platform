import { Module } from '@nestjs/common';
import { GrpcClientsModule } from '../grpc/grpc-clients.module.js';
import { SettlementsController } from './settlements.controller.js';
import { SettlementsService } from './settlements.service.js';

@Module({
  imports: [GrpcClientsModule],
  controllers: [SettlementsController],
  providers: [SettlementsService],
})
export class SettlementsModule {}
