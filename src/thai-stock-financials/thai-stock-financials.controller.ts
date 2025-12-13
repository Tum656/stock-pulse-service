import { Controller, Get, Param } from '@nestjs/common';
import { SetHighlightScraperService } from './thai-stock-financials.service';
import { ThaiStockFinancialsResponseDto } from './dto/ThaiStockFinancialsResponse.dto';
import { SetRightsBenefitsService } from './set-rights-benefits.service';
import { RightsBenefitsResponseDto } from './dto/rights-benefits/RightsBenefitsResponse.dto';

@Controller('thai-stock-financials')
export class ThaiStockFinancialsController {
  constructor(
    private readonly financialsService: SetHighlightScraperService,
    private readonly rightsBenefitsService: SetRightsBenefitsService,
  ) {}
  @Get(':symbol/key-financials')
  getKeyFinancials(
    @Param('symbol') symbol: string,
    // @Query('lang') lang: 'th' | 'en' = 'th',
  ): Promise<ThaiStockFinancialsResponseDto> {
    return this.financialsService.scrapeHighlights(symbol);
  }

  @Get('/rights-benefits/:symbol')
  getRightsBenefits(
    @Param('symbol') symbol: string,
    // @Query('lang') lang: 'th' | 'en' = 'th',
  ): Promise<RightsBenefitsResponseDto> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return,@typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-member-access
    return this.rightsBenefitsService.scrape(symbol);
  }
}
