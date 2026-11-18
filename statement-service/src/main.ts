import { NestFactory } from '@nestjs/core';
import { Transport } from '@nestjs/microservices';
import { join } from 'node:path';
import { AppModule, ObserveInstrument } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    instrument: ObserveInstrument,
  });

  app.connectMicroservice({
    transport: Transport.GRPC,
    options: {
      package: 'statement',
      protoPath: join(__dirname, '..', 'proto', 'statement.proto'),
      url: process.env.STATEMENT_GRPC_URL ?? '0.0.0.0:50056',
    },
  });

  await app.init();
  await app.startAllMicroservices();
}

void bootstrap();
