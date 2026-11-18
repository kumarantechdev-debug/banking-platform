import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
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
import { Public } from '../common/public.decorator.js';
import { CreateCustomerDto, ListCustomersDto } from './customer.dto.js';
import { CustomersService } from './customers.service.js';

@ApiTags('customers')
@Controller()
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Post('customers')
  @Public()
  @ApiOperation({ summary: 'Create a customer' })
  @ApiCreatedResponse({ description: 'Customer created' })
  @ApiBadRequestResponse({ description: 'Invalid customer details' })
  create(@Body() dto: CreateCustomerDto) {
    return this.customers.create(dto);
  }

  @Get('customers')
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'List customers' })
  @ApiOkResponse({ description: 'Paginated customer list' })
  @ApiBadRequestResponse({ description: 'Invalid list filters' })
  list(@Query() query: ListCustomersDto) {
    return this.customers.list(query);
  }

  @Get('customers/:id')
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Get a customer by ID' })
  @ApiParam({ name: 'id', type: Number })
  @ApiOkResponse({ description: 'Customer details' })
  @ApiBadRequestResponse({ description: 'Invalid customer ID' })
  @ApiNotFoundResponse({ description: 'Customer not found' })
  getById(@Param() params: PositiveIdParamDto) {
    return this.customers.getById(params.id);
  }
}
