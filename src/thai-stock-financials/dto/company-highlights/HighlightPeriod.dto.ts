import { MetricDto } from './Metric.dto';

export interface HighlightPeriodDto {
  periodKey: string;
  periodLabel: string;
  fromDate: string;
  toDate: string;

  financialAccounts: MetricDto[];
  financialRatios: MetricDto[];
}
