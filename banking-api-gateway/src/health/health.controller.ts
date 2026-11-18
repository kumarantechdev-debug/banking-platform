import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/public.decorator.js';

@ApiTags('health')
@Controller('health')
@Public()
export class HealthController {
  @Get()
  @ApiOperation({ summary: 'Check API Gateway health' })
  @ApiOkResponse({
    schema: {
      example: {
        status: 'success',
        service: 'banking-api-gateway',
      },
    },
  })
  getHealth() {
    return {
      status: 'success',
      service: 'banking-api-gateway',
    };
  }
}
