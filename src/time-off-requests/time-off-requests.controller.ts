import { Body, Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { CreateTimeOffRequestDto } from './dto/create-time-off-request.dto';
import { RejectTimeOffRequestDto } from './dto/reject-time-off-request.dto';
import { TimeOffRequestsService } from './time-off-requests.service';

@Controller('time-off-requests')
export class TimeOffRequestsController {
  constructor(private readonly timeOffRequestsService: TimeOffRequestsService) {}

  @Post()
  async create(@Body() body: CreateTimeOffRequestDto) {
    return this.timeOffRequestsService.create(body);
  }

  @Get(':id')
  async get(@Param('id', ParseIntPipe) id: number) {
    return this.timeOffRequestsService.getById(id);
  }

  @Post(':id/approve')
  async approve(@Param('id', ParseIntPipe) id: number) {
    return this.timeOffRequestsService.approve(id);
  }

  @Post(':id/reject')
  async reject(@Param('id', ParseIntPipe) id: number, @Body() body: RejectTimeOffRequestDto) {
    return this.timeOffRequestsService.reject(id, body.rejectionReason);
  }

  @Post(':id/cancel')
  async cancel(@Param('id', ParseIntPipe) id: number) {
    return this.timeOffRequestsService.cancel(id);
  }
}
