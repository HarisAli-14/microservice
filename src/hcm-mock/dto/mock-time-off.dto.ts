import { IsDateString, IsInt, IsNumber, IsPositive, IsString } from 'class-validator';

export class MockTimeOffDto {
  @IsInt()
  employeeId!: number;

  @IsInt()
  locationId!: number;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsNumber()
  @IsPositive()
  daysRequested!: number;

  @IsString()
  idempotencyKey!: string;
}
