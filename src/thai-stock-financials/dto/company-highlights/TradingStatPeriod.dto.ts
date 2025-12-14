import { MetricDto } from './Metric.dto';

export interface TradingStatPeriodDto {
  periodKey: string;
  periodLabel: string;
  financialStatementAsOf?: string;

  metrics: MetricDto[];
}
