import { Controller, Post } from '@nestjs/common';
import { TestingService } from './testing.service';

@Controller('testing')
export class TestingController {
  constructor(private readonly testingService: TestingService) {}

  @Post('reset')
  async reset() {
    return this.testingService.reset();
  }
}
