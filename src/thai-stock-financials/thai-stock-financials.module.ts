import { Module } from '@nestjs/common';
import { SetHighlightScraperService } from './thai-stock-financials.service';
import { ThaiStockFinancialsController } from './thai-stock-financials.controller';

@Module({
  controllers: [ThaiStockFinancialsController],
  providers: [SetHighlightScraperService],
})
export class ThaiStockFinancialsModule {}
