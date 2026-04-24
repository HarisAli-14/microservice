import { IsNotEmpty, IsString } from 'class-validator';

export class RejectTimeOffRequestDto {
  @IsString()
  @IsNotEmpty()
  rejectionReason!: string;
}
