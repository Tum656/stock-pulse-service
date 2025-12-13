import { RightBenefitItemDto } from './RightBenefitItem.dto';

export class RightsBenefitsResponseDto {
  symbol!: string;
  sourceUrl!: string;
  asOf!: string; // ISO string
  items!: RightBenefitItemDto[];
}
