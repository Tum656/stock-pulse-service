import { FinancialValueDto } from './FinancialValue.dto';

export class FinancialRowDto {
  rowKey: string;
  label: string;
  values: FinancialValueDto[];
}
