import { Module } from '@nestjs/common';
import { GrpcClientsModule } from '../grpc/grpc-clients.module.js';
import { CustomersController } from './customers.controller.js';
import { CustomersService } from './customers.service.js';

@Module({
  imports: [GrpcClientsModule],
  controllers: [CustomersController],
  providers: [CustomersService],
})
export class CustomersModule {}
