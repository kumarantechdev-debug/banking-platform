import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  StreamableFile,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiQuery,
  ApiCookieAuth,
  ApiTags,
} from '@nestjs/swagger';
import { PositiveIdParamDto } from '../common/positive-id-param.dto.js';
import {
  GenerateStatementDto,
  StatementTransactionsQueryDto,
} from './statements.dto.js';
import {
  StatementsService,
  type ExportStatementFileResponse,
} from './statements.service.js';

@ApiTags('statements')
@ApiCookieAuth('access_token')
@Controller('statements')
export class StatementsController {
  constructor(private readonly statements: StatementsService) {}

  @Post()
  @ApiOperation({ summary: 'Generate an account statement' })
  @ApiCreatedResponse({ description: 'Statement generated' })
  @ApiBadRequestResponse({
    description: 'Invalid statement period or account ID',
  })
  generate(@Body() dto: GenerateStatementDto) {
    return this.statements.generate(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a statement by ID' })
  @ApiParam({ name: 'id', type: Number })
  @ApiOkResponse({ description: 'Statement and its transactions' })
  @ApiBadRequestResponse({ description: 'Invalid statement ID' })
  @ApiNotFoundResponse({ description: 'Statement not found' })
  @ApiQuery({
    name: 'transactionType',
    enum: ['CREDIT', 'DEBIT'],
    required: false,
  })
  @ApiQuery({ name: 'fromDate', type: String, format: 'date', required: false })
  @ApiQuery({ name: 'toDate', type: String, format: 'date', required: false })
  @ApiQuery({ name: 'page', type: Number, minimum: 1, required: false })
  @ApiQuery({
    name: 'limit',
    type: Number,
    minimum: 1,
    maximum: 100,
    required: false,
  })
  getById(
    @Param() params: PositiveIdParamDto,
    @Query() query: StatementTransactionsQueryDto,
  ) {
    return this.statements.getById(params.id, query);
  }

  @Get(':id/export/csv')
  @ApiOperation({ summary: 'Export a statement as CSV' })
  @ApiParam({ name: 'id', type: Number })
  @ApiProduces('text/csv')
  @ApiOkResponse({
    description: 'CSV statement file',
    schema: { type: 'string', format: 'binary' },
  })
  @ApiBadRequestResponse({ description: 'Invalid statement ID' })
  @ApiNotFoundResponse({ description: 'Statement not found' })
  async exportCsv(
    @Param() params: PositiveIdParamDto,
  ): Promise<StreamableFile> {
    return this.toDownload(this.statements.exportCsv(params.id));
  }

  @Get(':id/export/pdf')
  @ApiOperation({ summary: 'Export a statement as PDF' })
  @ApiParam({ name: 'id', type: Number })
  @ApiProduces('application/pdf')
  @ApiOkResponse({
    description: 'PDF statement file',
    schema: { type: 'string', format: 'binary' },
  })
  @ApiBadRequestResponse({ description: 'Invalid statement ID' })
  @ApiNotFoundResponse({ description: 'Statement not found' })
  async exportPdf(
    @Param() params: PositiveIdParamDto,
  ): Promise<StreamableFile> {
    return this.toDownload(this.statements.exportPdf(params.id));
  }

  private async toDownload(
    fileResponse: Promise<ExportStatementFileResponse>,
  ): Promise<StreamableFile> {
    const file = await fileResponse;
    const fileName = file.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    return new StreamableFile(file.content, {
      type: file.contentType,
      disposition: `attachment; filename="${fileName}"`,
    });
  }
}
