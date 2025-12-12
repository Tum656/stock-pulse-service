import { FinancialPeriodDto } from './FinancialPeriod.dto';
import { FinancialSectionDto } from './FinancialSection.dto';

export class ThaiStockFinancialsResponseDto {
  symbol: string;
  unit: string; // ล้านบาท
  periods: FinancialPeriodDto[];
  sections: FinancialSectionDto[];
}
