import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { FailureModeDto } from './dto/failure-mode.dto';
import { ExternalBalanceChangeDto } from './dto/external-balance-change.dto';
import { MockTimeOffDto } from './dto/mock-time-off.dto';
import { ValidationModeDto } from './dto/validation-mode.dto';
import { HcmMockService } from './hcm-mock.service';

@Controller('mock-hcm')
export class HcmMockController {
  constructor(private readonly hcmMockService: HcmMockService) {}

  @Get('balances/:employeeId/:locationId')
  async getBalance(
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Param('locationId', ParseIntPipe) locationId: number,
  ) {
    return this.hcmMockService.getBalance(employeeId, locationId);
  }

  @Post('time-off')
  async createTimeOff(@Body() body: MockTimeOffDto) {
    return this.hcmMockService.createTimeOff(body);
  }

  @Delete('time-off/:hcmReferenceId')
  async cancelTimeOff(@Param('hcmReferenceId') hcmReferenceId: string) {
    return this.hcmMockService.cancelTimeOff(hcmReferenceId);
  }

  @Get('batch-balances')
  async getBatchBalances() {
    return this.hcmMockService.getBatchBalances();
  }

  @Post('external-balance-change')
  async externalBalanceChange(@Body() body: ExternalBalanceChangeDto) {
    return this.hcmMockService.externalBalanceChange(body);
  }

  @Post('config/failure-mode')
  async setFailureMode(@Body() body: FailureModeDto) {
    return this.hcmMockService.setFailureMode(body.mode);
  }

  @Post('config/validation-mode')
  async setValidationMode(@Body() body: ValidationModeDto) {
    return this.hcmMockService.setValidationMode(body.mode);
  }

  @Post('reset')
  async reset() {
    return this.hcmMockService.resetState();
  }
}
