import { Module } from '@nestjs/common';
import { SetHighlightScraperService } from './thai-stock-financials.service';
import { ThaiStockFinancialsController } from './thai-stock-financials.controller';
import { SetRightsBenefitsService } from './set-rights-benefits.service';

@Module({
  controllers: [ThaiStockFinancialsController],
  providers: [SetHighlightScraperService, SetRightsBenefitsService],
})
export class ThaiStockFinancialsModule {}
