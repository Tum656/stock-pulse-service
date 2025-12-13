import { Module } from '@nestjs/common';
import { SetHighlightScraperService } from './thai-stock-financials.service';
import { ThaiStockFinancialsController } from './thai-stock-financials.controller';
import { SetRightsBenefitsService } from './set-rights-benefits.service';
import { SetMajorShareholdersService } from './set-major-shareholders.service';

@Module({
  controllers: [ThaiStockFinancialsController],
  providers: [SetHighlightScraperService, SetRightsBenefitsService,SetMajorShareholdersService],
})
export class ThaiStockFinancialsModule {}
