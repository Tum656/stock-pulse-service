export interface YahooChartResponse {
  chart: {
    result: Array<{
      meta: Record<string, any>;
      timestamp: number[];
      indicators: {
        quote: Array<{
          timestamp: number[];
          open: number[];
          close: number[];
          high: number[];
          low: number[];
          volume: number[];
        }>;
      };
    }>;
    error: null | Record<string, any>;
  };
}
