import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Transport } from '@nestjs/microservices';
import { NestFactory } from '@nestjs/core';
import type { MicroserviceOptions } from '@nestjs/microservices';
import { AppModule, ObserveInstrument } from './app.module.js';

function getProtoPath(): string {
  const protoPath = [
    join(import.meta.dirname, '../proto/customer.proto'),
    join(import.meta.dirname, 'proto/customer.proto'),
  ].find(existsSync);

  if (!protoPath) {
    throw new Error('Unable to find proto/customer.proto');
  }

  return protoPath;
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    instrument: ObserveInstrument,
  });
  app.enableShutdownHooks();
  const grpcPort = app.get(ConfigService).getOrThrow<string>('GRPC_PORT');

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: 'customer',
      protoPath: getProtoPath(),
      url: `0.0.0.0:${grpcPort}`,
    },
  });

  await app.startAllMicroservices();
  Logger.log(
    `gRPC listening on 0.0.0.0:${grpcPort} (plaintext, TLS disabled)`,
    'Bootstrap',
  );
}
await bootstrap();
