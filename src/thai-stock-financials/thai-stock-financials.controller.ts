import { Controller, Get, Param } from '@nestjs/common';
import { SetHighlightScraperService } from './thai-stock-financials.service';
import { ThaiStockFinancialsResponseDto } from './dto/ThaiStockFinancialsResponse.dto';

@Controller('thai-stock-financials')
export class ThaiStockFinancialsController {
  constructor(private readonly svc: SetHighlightScraperService) {}

  @Get(':symbol/key-financials')
  getKeyFinancials(
    @Param('symbol') symbol: string,
    // @Query('lang') lang: 'th' | 'en' = 'th',
  ): Promise<ThaiStockFinancialsResponseDto> {
    return this.svc.scrapeBtsHighlights(symbol);
  }
}
