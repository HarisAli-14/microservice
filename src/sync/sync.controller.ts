import { Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { SyncService } from './sync.service';

@Controller('sync/hcm')
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Post('batch-balances')
  async batchBalances() {
    return this.syncService.batchImportBalances();
  }

  @Post('reconcile/:employeeId/:locationId')
  async reconcileOne(
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Param('locationId', ParseIntPipe) locationId: number,
  ) {
    return this.syncService.reconcile(employeeId, locationId);
  }

  @Post('reconcile-all')
  async reconcileAll() {
    return this.syncService.reconcileAll();
  }

  @Get('mismatches')
  async mismatches() {
    return this.syncService.getMismatches();
  }
}
