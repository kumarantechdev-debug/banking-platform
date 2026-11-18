import { Module } from '@nestjs/common';
import { GrpcClientsModule } from '../grpc/grpc-clients.module.js';
import { SearchController } from './search.controller.js';
import { SearchService } from './search.service.js';

@Module({
  imports: [GrpcClientsModule],
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
