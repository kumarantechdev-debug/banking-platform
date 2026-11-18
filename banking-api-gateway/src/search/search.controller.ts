import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiCookieAuth,
  ApiTags,
} from '@nestjs/swagger';
import { SearchCustomersDto } from './search.dto.js';
import { SearchService } from './search.service.js';

@ApiTags('search')
@ApiCookieAuth('access_token')
@Controller('search')
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get('customers')
  @ApiOperation({ summary: 'Search customers' })
  @ApiOkResponse({ description: 'Matching customers' })
  @ApiBadRequestResponse({ description: 'Invalid search query' })
  searchCustomers(@Query() query: SearchCustomersDto) {
    return this.search.searchCustomers(query);
  }
}
