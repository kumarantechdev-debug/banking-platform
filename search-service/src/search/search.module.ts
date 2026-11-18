import { Module } from '@nestjs/common';
import { REDIS_CLIENT } from '../redis/redis.constants';
import { RedisModule } from '../redis/redis.module';
import { RedisService } from '../redis/redis.service';
import { SearchGrpcController } from './search.grpc.controller';
import { SearchService } from './search.service';

@Module({
  imports: [RedisModule],
  controllers: [SearchGrpcController],
  providers: [
    SearchService,
    {
      provide: REDIS_CLIENT,
      useFactory: (redisService: RedisService) => redisService.client,
      inject: [RedisService],
    },
  ],
})
export class SearchModule {}
