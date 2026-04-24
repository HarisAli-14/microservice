import { IsEnum } from 'class-validator';
import { HcmFailureMode } from '../../common/enums';

export class FailureModeDto {
  @IsEnum(HcmFailureMode)
  mode!: HcmFailureMode;
}
