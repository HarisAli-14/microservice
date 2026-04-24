import { Module } from '@nestjs/common';
import { HcmMockController } from './hcm-mock.controller';
import { HcmMockService } from './hcm-mock.service';

@Module({
  controllers: [HcmMockController],
  providers: [HcmMockService],
})
export class HcmMockModule {}
