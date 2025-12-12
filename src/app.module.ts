import { Module } from '@nestjs/common';
import { MarketDataModule } from './market-data/market-data.module';
import { ThaiStockFinancialsModule } from './thai-stock-financials/thai-stock-financials.module';

@Module({
  imports: [MarketDataModule, ThaiStockFinancialsModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
