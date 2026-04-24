import { IsDateString, IsInt, IsNotEmpty, IsNumber, IsPositive, IsString } from 'class-validator';

export class CreateTimeOffRequestDto {
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
  @IsNotEmpty()
  idempotencyKey!: string;
}
