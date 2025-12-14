export interface MetricDto {
  key: string;
  label: string;
  value: number | null;
  unit?: string;
}
