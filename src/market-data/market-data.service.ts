import { Injectable } from '@nestjs/common';
import got, { Response } from 'got';
import { CreateMarketDatumDto } from './dto/create-market-datum.dto';
import { YahooChartResponse } from './dto/yahooChartResponse.dto';
import { Logger } from '@nestjs/common';
@Injectable()
export class MarketDataService {
  private readonly logger = new Logger(MarketDataService.name);

  async getYahooChart(createMarketDatumDto: CreateMarketDatumDto) {
    const symbol = createMarketDatumDto.name.concat('.').concat(createMarketDatumDto.country);
    const url = new URL(`https://query2.finance.yahoo.com/v8/finance/chart/${symbol}`);

    if (
      createMarketDatumDto.interval !== null &&
      createMarketDatumDto.interval !== undefined &&
      createMarketDatumDto.interval !== ''
    ) {
      url.searchParams.set('interval', createMarketDatumDto.interval);
    }
    if (
      createMarketDatumDto.range !== null &&
      createMarketDatumDto.range !== undefined &&
      createMarketDatumDto.range !== ''
    ) {
      url.searchParams.set('range', createMarketDatumDto.range);
    }
    const finalUrl = url.toString();
    this.logger.debug(`Fetching url :  ${finalUrl}`);
    try {
      const response: Response<YahooChartResponse> = await got.get<YahooChartResponse>(finalUrl, {
        responseType: 'json',
        timeout: 5000,
        retry: 2,
        headers: { 'User-Agent': 'StockPulse/1.0' },
      });

      const data = response.body;

      return {
        success: true,
        symbol,

        data,
      };
    } catch (err: unknown) {
      const error = err as Error;

      return {
        success: false,
        symbol,
        error: error.message,
      };
    }
  }
}
