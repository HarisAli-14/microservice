import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { BalancesService } from './balances.service';

@Controller('balances')
export class BalancesController {
  constructor(private readonly balancesService: BalancesService) {}

  @Get(':employeeId/:locationId')
  async getBalance(
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Param('locationId', ParseIntPipe) locationId: number,
  ) {
    return this.balancesService.getBalanceOrThrow(employeeId, locationId);
  }
}
