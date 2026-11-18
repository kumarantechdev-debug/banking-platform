import { NestFactory } from '@nestjs/core';
import { Transport, type MicroserviceOptions } from '@nestjs/microservices';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const compiledProtoPath = join(__dirname, 'proto', 'search.proto');
  const protoPath = existsSync(compiledProtoPath)
    ? compiledProtoPath
    : resolve(process.cwd(), 'proto', 'search.proto');
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AppModule,
    {
      transport: Transport.GRPC,
      options: {
        package: 'search',
        protoPath,
        url: `${process.env.GRPC_HOST ?? '0.0.0.0'}:${process.env.GRPC_PORT ?? '50053'}`,
      },
    },
  );
  app.enableShutdownHooks();
  await app.listen();
}

void bootstrap().catch((error: unknown) => {
  console.error('Failed to start Search Service gRPC server', error);
  process.exitCode = 1;
});
