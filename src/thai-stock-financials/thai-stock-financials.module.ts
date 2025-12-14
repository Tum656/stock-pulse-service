import { Module } from '@nestjs/common';
import { ThaiStockFinancialsController } from './thai-stock-financials.controller';
import { SetRightsBenefitsService } from './set-rights-benefits.service';
import { SetMajorShareholdersService } from './set-major-shareholders.service';
import { SetCompanyProfileService } from './set-company-profile.service';
import { SetCompanyHighlightsService } from './set-company-highlights.service';

@Module({
  controllers: [ThaiStockFinancialsController],
  providers: [
    SetRightsBenefitsService,
    SetMajorShareholdersService,
    SetCompanyProfileService,
    SetCompanyHighlightsService,
  ],
})
export class ThaiStockFinancialsModule {}
