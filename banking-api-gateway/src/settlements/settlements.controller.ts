import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiCookieAuth,
  ApiTags,
} from '@nestjs/swagger';
import { PositiveIdParamDto } from '../common/positive-id-param.dto.js';
import { CreateSettlementDto, SettlementReportDto } from './settlements.dto.js';
import { SettlementsService } from './settlements.service.js';

@ApiTags('settlements')
@ApiCookieAuth('access_token')
@Controller('settlements')
export class SettlementsController {
  constructor(private readonly settlements: SettlementsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a settlement job' })
  @ApiCreatedResponse({ description: 'Settlement job created' })
  @ApiBadRequestResponse({ description: 'Invalid job date' })
  create(@Body() dto: CreateSettlementDto) {
    return this.settlements.create(dto);
  }

  @Post(':id/process')
  @ApiOperation({ summary: 'Process a settlement job' })
  @ApiParam({ name: 'id', type: Number })
  @ApiOkResponse({ description: 'Settlement processing result' })
  @ApiBadRequestResponse({ description: 'Invalid settlement job ID' })
  @ApiNotFoundResponse({ description: 'Settlement job not found' })
  process(@Param() params: PositiveIdParamDto) {
    return this.settlements.process(params.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a settlement job by ID' })
  @ApiParam({ name: 'id', type: Number })
  @ApiOkResponse({ description: 'Settlement job details' })
  @ApiBadRequestResponse({ description: 'Invalid settlement job ID' })
  @ApiNotFoundResponse({ description: 'Settlement job not found' })
  getById(@Param() params: PositiveIdParamDto) {
    return this.settlements.getById(params.id);
  }

  @Get(':id/report')
  @ApiOperation({ summary: 'Get a settlement failure report' })
  @ApiParam({ name: 'id', type: Number })
  @ApiOkResponse({
    description: 'Settlement failure report',
    type: SettlementReportDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid settlement job ID' })
  @ApiNotFoundResponse({ description: 'Settlement job not found' })
  getReport(@Param() params: PositiveIdParamDto) {
    return this.settlements.getReport(params.id);
  }
}
