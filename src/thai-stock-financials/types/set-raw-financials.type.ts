export interface SetRawFinancials {
  periods: string[];
  rows: Record<string, Array<number | null>>;
}