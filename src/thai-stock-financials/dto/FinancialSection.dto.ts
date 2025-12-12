import { FinancialRowDto } from './FinancialRow.dto';

export class FinancialSectionDto {
  sectionKey: string; // balance_sheet
  sectionLabel: string; // งบแสดงฐานะการเงิน
  rows: FinancialRowDto[];
}
