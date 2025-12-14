import { Controller, Get, Param } from '@nestjs/common';
import { SetRightsBenefitsService } from './set-rights-benefits.service';
import { RightsBenefitsResponseDto } from './dto/rights-benefits/RightsBenefitsResponse.dto';
import { MajorShareholdersResponseDto } from './dto/major-shareholders/MajorShareholdersResponse.dto';
import { SetMajorShareholdersService } from './set-major-shareholders.service';
import { CompanyProfileResponseDto } from './dto/company-profileInfo/companyProfileResponse.dto';
import { SetCompanyProfileService } from './set-company-profile.service';
import { SetCompanyHighlightsService } from './set-company-highlights.service';
import { SetCompanyHighlightsResponseDto } from './dto/company-highlights/CompanyHighlightsResponse.dto';

@Controller('thai-stock-financials')
export class ThaiStockFinancialsController {
  constructor(
    private readonly rightsBenefitsService: SetRightsBenefitsService,
    private readonly setMajorShareholdersService: SetMajorShareholdersService,
    private readonly setCompanyProfileService: SetCompanyProfileService,
    private readonly setCompanyHighlightsService: SetCompanyHighlightsService,
  ) {}
  @Get(':symbol/key-financials')
  getKeyFinancials(
    @Param('symbol') symbol: string,
    // @Query('lang') lang: 'th' | 'en' = 'th',
  ): Promise<SetCompanyHighlightsResponseDto> {
    return this.setCompanyHighlightsService.scrape(symbol);
  }

  @Get('/rights-benefits/:symbol')
  getRightsBenefits(
    @Param('symbol') symbol: string,
    // @Query('lang') lang: 'th' | 'en' = 'th',
  ): Promise<RightsBenefitsResponseDto> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return,@typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-member-access
    return this.rightsBenefitsService.scrape(symbol);
  }

  @Get('/major-shareholders/:symbol')
  getMajorShareholders(
    @Param('symbol') symbol: string,
    // @Query('lang') lang: 'th' | 'en' = 'th',
  ): Promise<MajorShareholdersResponseDto> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return,@typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-member-access
    return this.setMajorShareholdersService.scrape(symbol);
  }

  @Get('/company-profileInfo/:symbol')
  getCompanyProfileInfo(
    @Param('symbol') symbol: string,
    // @Query('lang') lang: 'th' | 'en' = 'th',
  ): Promise<CompanyProfileResponseDto> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return,@typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-member-access
    return this.setCompanyProfileService.scrapeCompanyProfile(symbol);
  }
}
