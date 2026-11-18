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
import { CreateAccountDto, CreateTransferDto } from './banking.dto.js';
import { BankingService } from './banking.service.js';

@ApiTags('accounts')
@ApiCookieAuth('access_token')
@Controller('accounts')
export class AccountsController {
  constructor(private readonly banking: BankingService) {}

  @Post()
  @ApiOperation({ summary: 'Create an account' })
  @ApiCreatedResponse({ description: 'Account created' })
  @ApiBadRequestResponse({ description: 'Invalid account details' })
  create(@Body() dto: CreateAccountDto) {
    return this.banking.createAccount(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an account by ID' })
  @ApiParam({ name: 'id', type: Number })
  @ApiOkResponse({ description: 'Account details' })
  @ApiBadRequestResponse({ description: 'Invalid account ID' })
  @ApiNotFoundResponse({ description: 'Account not found' })
  getById(@Param() params: PositiveIdParamDto) {
    return this.banking.getAccount(params.id);
  }
}

@ApiTags('transfers')
@ApiCookieAuth('access_token')
@Controller('transfers')
export class TransfersController {
  constructor(private readonly banking: BankingService) {}

  @Post()
  @ApiOperation({ summary: 'Create a transfer' })
  @ApiCreatedResponse({ description: 'Transfer created' })
  @ApiBadRequestResponse({ description: 'Invalid transfer details' })
  create(@Body() dto: CreateTransferDto) {
    return this.banking.createTransfer(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a transfer by ID' })
  @ApiParam({ name: 'id', type: Number })
  @ApiOkResponse({ description: 'Transfer details' })
  @ApiBadRequestResponse({ description: 'Invalid transfer ID' })
  @ApiNotFoundResponse({ description: 'Transfer not found' })
  getById(@Param() params: PositiveIdParamDto) {
    return this.banking.getTransfer(params.id);
  }
}
