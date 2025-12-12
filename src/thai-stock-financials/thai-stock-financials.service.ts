// set-highlight-scraper.service.ts
import { Injectable, Logger } from '@nestjs/common';
import puppeteer, { Browser, Page } from 'puppeteer';
import { ThaiStockFinancialsResponseDto } from './dto/ThaiStockFinancialsResponse.dto';
import { FinancialPeriodDto } from './dto/FinancialPeriod.dto';
import { FinancialRowDto } from './dto/FinancialRow.dto';

@Injectable()
export class SetHighlightScraperService {
  private readonly logger = new Logger(SetHighlightScraperService.name);
  private browser: Browser | null = null;

  // ================= Browser =================
  private async getBrowser(): Promise<Browser> {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
    }
    return this.browser;
  }

  // ================= Public API =================
  async scrapeHighlights(symbol: string): Promise<ThaiStockFinancialsResponseDto> {
    const url = `https://www.set.or.th/th/market/product/stock/quote/${symbol}/financial-statement/company-highlights`;

    const browser = await this.getBrowser();
    const page = await browser.newPage();

    try {
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36');

      // เบาสุด
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        const block = ['image', 'stylesheet', 'font', 'media'];
        if (block.includes(req.resourceType())) req.abort();
        else req.continue();
      });

      // ❗ ไม่ wait อะไรเลย
      await page.goto(url, { timeout: 0 });

      // poll หา table
      const { financialTable, marketTable } = await this.pollTables(page);

      return this.mapTablesToDto(symbol, financialTable, marketTable);
    } finally {
      await page.close();
    }
  }

  // ================= Poll tables =================
  private async pollTables(page: Page): Promise<{
    financialTable: string[][];
    marketTable: string[][];
  }> {
    const MAX_TRY = 20;

    for (let i = 0; i < MAX_TRY; i++) {
      const result = await page.evaluate(() => {
        const extract = (tbl?: Element | null) =>
          tbl
            ? Array.from(tbl.querySelectorAll('tr')).map((tr) =>
                Array.from(tr.querySelectorAll('th,td')).map((td) =>
                  (td.textContent || '').replace(/\s+/g, ' ').trim(),
                ),
              )
            : [];

        const tables = Array.from(document.querySelectorAll('table'));

        const financial = tables.find(
          (t) => t.innerText.includes('งวดงบการเงิน') && t.innerText.includes('สินทรัพย์รวม'),
        );

        const market = tables.find((t) => t.innerText.includes('ค่าสถิติสำคัญ') || t.innerText.includes('P/E (เท่า)'));

        return {
          financialTable: extract(financial),
          marketTable: extract(market),
        };
      });

      if (result.financialTable.length && result.marketTable.length) {
        this.logger.debug(`SET tables found after ${i + 1} tries`);
        return result;
      }

      await this.sleep(1000);
    }

    throw new Error('SET tables not found');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  // ================= Mapper =================
  private mapTablesToDto(
    symbol: string,
    financialTable: string[][],
    marketTable: string[][],
  ): ThaiStockFinancialsResponseDto {
    const parseNumber = (s: string): number | null => {
      if (!s || s === '-' || s === '—') return null;
      const n = Number(s.replace(/,/g, ''));
      return Number.isFinite(n) ? n : null;
    };

    const normalizePeriod = (s: string): FinancialPeriodDto => {
      const clean = s.replace(/\s+/g, ' ').trim();

      const month = clean.match(/(\d+)\s*เดือน.*?(25\d{2})/);
      if (month) {
        return {
          key: `${month[1]}M${month[2]}`,
          label: `งบ ${month[1]} เดือน ${month[2]}`,
        };
      }

      const year = clean.match(/25\d{2}/);
      if (year) {
        return {
          key: `FY${year[0]}`,
          label: `งบปี ${year[0]}`,
        };
      }

      return { key: clean, label: clean };
    };

    // ---------- Financial ----------
    const periods = financialTable[0].slice(1).map(normalizePeriod);

    const FIN_MAP: Record<string, string> = {
      สินทรัพย์รวม: 'totalAssets',
      หนี้สินรวม: 'totalLiabilities',
      ส่วนของผู้ถือหุ้น: 'equity',
      มูลค่าหุ้นที่เรียกชำระแล้ว: 'Profit (Loss) from Other Activities',
      รายได้รวม: 'totalRevenue',
      กำไรสุทธิ: 'netProfit',
      'กำไรต่อหุ้น (บาท)': 'eps',
    };

    const financialRows: FinancialRowDto[] = [];

    for (let i = 1; i < financialTable.length; i++) {
      const label = financialTable[i][0];
      const rowKey = FIN_MAP[label];
      if (!rowKey) continue;

      financialRows.push({
        rowKey,
        label,
        values: periods.map((p, idx) => ({
          periodKey: p.key,
          value: parseNumber(financialTable[i][idx + 1]),
        })),
      });
    }

    // ---------- Market ----------
    const marketPeriods = marketTable[0].slice(1).map(normalizePeriod);

    const MARKET_MAP: Record<string, string> = {
      'ราคาล่าสุด (บาท)': 'lastPrice',
      'มูลค่าหลักทรัพย์ตามราคาตลาด (ล้านบาท)': 'marketCap',
      'P/E (เท่า)': 'pe',
      'P/BV (เท่า)': 'pbv',
      'มูลค่าหุ้นทางบัญชีต่อหุ้น (บาท)': 'bvps',
      'อัตราส่วนเงินปันผลตอบแทน (%)': 'dividendYield',
    };

    const marketRows: FinancialRowDto[] = [];

    for (let i = 1; i < marketTable.length; i++) {
      const label = marketTable[i][0];
      const rowKey = MARKET_MAP[label];
      if (!rowKey) continue;

      marketRows.push({
        rowKey,
        label,
        values: marketPeriods.map((p, idx) => ({
          periodKey: p.key,
          value: parseNumber(marketTable[i][idx + 1]),
        })),
      });
    }

    return {
      symbol,
      unit: 'ล้านบาท',
      periods,
      sections: [
        {
          sectionKey: 'key_financials',
          sectionLabel: 'บัญชีทางการเงินที่สำคัญ',
          rows: financialRows,
        },
        {
          sectionKey: 'market_statistics',
          sectionLabel: 'ค่าสถิติสำคัญ ณ วันที่',
          rows: marketRows,
        },
      ],
    };
  }
}
