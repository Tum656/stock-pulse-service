import { Body, Controller, Post } from '@nestjs/common';
import { MarketDataService } from './market-data.service';
import { CreateMarketDatumDto } from './dto/create-market-datum.dto';

@Controller('market-data')
export class MarketDataController {
  constructor(private readonly marketDataService: MarketDataService) {}

  @Post()
  getMarketData(@Body() createMarketDatumDto: CreateMarketDatumDto) {
    return this.marketDataService.getYahooChart(createMarketDatumDto);
  }
}
