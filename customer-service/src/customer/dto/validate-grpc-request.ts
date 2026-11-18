import { status } from '@grpc/grpc-js';
import { plainToInstance } from 'class-transformer';
import { validate, type ValidationError } from 'class-validator';
import { RpcException } from '@nestjs/microservices';

export async function validateGrpcRequest<T extends object>(
  dtoClass: new () => T,
  request: unknown,
): Promise<T> {
  const dto = plainToInstance(dtoClass, request ?? {});
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });

  if (errors.length > 0) {
    throw invalidArgument(validationMessage(errors));
  }

  return dto;
}

export function invalidArgument(message: string): RpcException {
  return new RpcException({ code: status.INVALID_ARGUMENT, message });
}

function validationMessage(errors: ValidationError[]): string {
  return errors
    .flatMap(({ property, constraints }) =>
      Object.values(constraints ?? {}).map(
        (constraint) => `${property}: ${constraint}`,
      ),
    )
    .join('; ');
}
