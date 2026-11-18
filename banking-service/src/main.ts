import { NestFactory } from '@nestjs/core';
import { RpcException, Transport } from '@nestjs/microservices';
import { ValidationPipe } from '@nestjs/common';
import { status } from '@grpc/grpc-js';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { AppModule, ObserveInstrument } from './app.module';

async function bootstrap() {
  const compiledProtoPath = resolve(__dirname, 'proto', 'banking.proto');
  const sourceProtoPath = resolve(__dirname, '..', 'proto', 'banking.proto');
  const app = await NestFactory.create(AppModule, {
    instrument: ObserveInstrument,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      exceptionFactory: (errors) =>
        new RpcException({
          code: status.INVALID_ARGUMENT,
          message: errors
            .flatMap((error) => Object.values(error.constraints ?? {}))
            .join('; '),
        }),
    }),
  );
  app.connectMicroservice(
    {
      transport: Transport.GRPC,
      options: {
        url: '0.0.0.0:50052',
        package: 'banking',
        protoPath: existsSync(compiledProtoPath)
          ? compiledProtoPath
          : sourceProtoPath,
        loader: {
          keepCase: false,
          longs: String,
          enums: String,
          defaults: true,
          oneofs: true,
        },
      },
    },
    { inheritAppConfig: true },
  );
  app.enableShutdownHooks();
  await app.init();
  await app.startAllMicroservices();
}
void bootstrap();
