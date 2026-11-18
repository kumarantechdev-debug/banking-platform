import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { join } from 'node:path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
    transport: Transport.GRPC,
    options: {
      url: `0.0.0.0:${process.env.GRPC_PORT ?? 50055}`,
      package: 'settlement',
      protoPath: join(process.cwd(), 'proto', 'settlement.proto'),
      loader: {
        keepCase: true,
        longs: Number,
        defaults: true,
        arrays: true,
      },
    },
  });

  await app.listen();
  console.log(`Settlement gRPC service listening on ${process.env.GRPC_PORT ?? 50055}`);
}

void bootstrap();
