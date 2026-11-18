import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomerGrpcController } from './customer.grpc.controller.js';
import { CustomerService } from './customer.service.js';
import { Customer } from './entities/customer.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([Customer])],
  controllers: [CustomerGrpcController],
  providers: [CustomerService],
  exports: [TypeOrmModule],
})
export class CustomerModule {}
