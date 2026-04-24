import { IsInt, IsNumber, IsOptional } from 'class-validator';

export class ExternalBalanceChangeDto {
  @IsInt()
  employeeId!: number;

  @IsInt()
  locationId!: number;

  @IsOptional()
  @IsNumber()
  deltaDays?: number;

  @IsOptional()
  @IsNumber()
  availableDays?: number;
}
