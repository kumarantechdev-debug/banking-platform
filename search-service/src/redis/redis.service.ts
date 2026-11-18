import {
  Injectable,
  Logger,
  OnApplicationShutdown,
} from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnApplicationShutdown {
  private readonly logger = new Logger(RedisService.name);
  readonly client: Redis;

  constructor() {
    const port = Number(process.env.REDIS_PORT ?? 6379);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error('REDIS_PORT must be a valid TCP port');
    }

    this.client = new Redis({
      host: process.env.REDIS_HOST ?? 'localhost',
      port,
      retryStrategy: (attempt) => Math.min(attempt * 100, 2000),
      maxRetriesPerRequest: 2,
    });

    this.client.on('connect', () => this.logger.log('Redis connected'));
    this.client.on('ready', () => this.logger.log('Redis ready'));
    this.client.on('error', (error: Error) =>
      this.logger.error(`Redis connection error: ${error.message}`),
    );
    this.client.on('reconnecting', (delay: number) =>
      this.logger.warn(`Redis reconnecting in ${delay}ms`),
    );
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.client.status === 'ready') {
      await this.client.quit();
    } else {
      this.client.disconnect();
    }
    this.logger.log('Redis connection closed');
  }
}
