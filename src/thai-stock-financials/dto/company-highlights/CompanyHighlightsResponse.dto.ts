import { TradingStatPeriodDto } from './TradingStatPeriod.dto';
import { HighlightPeriodDto } from './HighlightPeriod.dto';

export interface SetCompanyHighlightsResponseDto {
  symbol: string;
  sourceUrl: string;
  asOf: string;

  highlights: {
    unit: string; // "ล้านบาท"
    periods: HighlightPeriodDto[];
  };

  tradingStats: {
    periods: TradingStatPeriodDto[];
  };
}
