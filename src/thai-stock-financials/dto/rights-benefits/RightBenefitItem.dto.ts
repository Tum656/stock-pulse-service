import { RightBenefitDetailsDto } from './RightBenefitDetails.dto';
import { LabelValueDto } from './LabelValue.dto';
import { RightBenefitSign } from '../../../constange/constange.type';

export class RightBenefitItemDto {
  // หัวแถบสีส้ม
  eventDateText!: string;
  sign!: RightBenefitSign;
  benefitTypeText!: string;
  amountText!: string;

  // เผื่อทำกราฟ/คำนวณ
  amountValue?: number | null;
  currency?: 'THB';

  details!: RightBenefitDetailsDto;

  rawPairs!: LabelValueDto[];
}