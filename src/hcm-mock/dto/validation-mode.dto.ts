import { IsEnum } from 'class-validator';
import { HcmValidationMode } from '../../common/enums';

export class ValidationModeDto {
  @IsEnum(HcmValidationMode)
  mode!: HcmValidationMode;
}
