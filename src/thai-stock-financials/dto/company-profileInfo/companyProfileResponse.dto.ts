import { CompanyProfileInfoDto } from './companyProfileInfo.dto';

export class CompanyProfileResponseDto {
  symbol!: string;
  sourceUrl!: string;
  asOf!: string;
  info!: CompanyProfileInfoDto;
}
