import { Injectable, Logger } from '@nestjs/common';
import puppeteer, { Browser, Page } from 'puppeteer';
import { ThaiStockFinancialsResponseDto } from './dto/ThaiStockFinancialsResponse.dto';
import { FinancialPeriodDto } from './dto/FinancialPeriod.dto';
import { FinancialRowDto } from './dto/FinancialRow.dto';
import { FinancialValueDto } from './dto/FinancialValue.dto';
import { FinancialSectionDto } from './dto/FinancialSection.dto';

@Injectable()
export class SetHighlightScraperService {
  private readonly logger = new Logger(SetHighlightScraperService.name);

  private browser: Browser | null = null;

  private async getBrowser() {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
    }
    return this.browser;
  }

  async scrapeBtsHighlights(symbol: string): Promise<ThaiStockFinancialsResponseDto> {
    const url = `https://www.set.or.th/th/market/product/stock/quote/${symbol}/financial-statement/company-highlights`;

    const browser = await this.getBrowser();
    const page = await browser.newPage();

    try {
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36');

      // block resource ให้เบาสุด
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        const block = ['image', 'stylesheet', 'font', 'media'];
        if (block.includes(req.resourceType())) req.abort();
        else req.continue();
      });

      // ❗ ไม่รออะไรทั้งนั้น
      await page.goto(url, { timeout: 0 });

      // ✅ poll หา table จริง
      const rawTable = await this.pollFinancialTable(page);

      return this.mapRawTableToDto(symbol, rawTable);
    } finally {
      await page.close();
    }
  }

  private async pollFinancialTable(page: Page): Promise<string[][]> {
    const MAX_TRY = 15;

    for (let i = 0; i < MAX_TRY; i++) {
      const table = await page.evaluate(() => {
        const tables = Array.from(document.querySelectorAll('table'));

        const target = tables.find((t) => t.innerText.includes('งวดงบการเงิน') && t.innerText.includes('สินทรัพย์รวม'));

        if (!target) return null;

        return Array.from(target.querySelectorAll('tr')).map((tr) =>
          Array.from(tr.querySelectorAll('th,td')).map((td) => (td.textContent || '').replace(/\s+/g, ' ').trim()),
        );
      });

      if (table && table.length > 0) {
        this.logger.debug(`SET table found after ${i + 1} tries`);
        return table;
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      await this.sleep(1000);
    }

    throw new Error('SET financial table not found after polling');
  }
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  mapRawTableToDto(symbol: string, rawTable: string[][]): ThaiStockFinancialsResponseDto {
    // ---------- helpers ----------
    const parseNumber = (s: string): number | null => {
      if (!s || s === '-' || s === '—') return null;
      const n = Number(s.replace(/,/g, ''));
      return Number.isFinite(n) ? n : null;
    };

    const normalizePeriod = (s: string): FinancialPeriodDto => {
      const clean = s.replace(/\s+/g, ' ').trim();

      // --- งบ x เดือน ---
      const monthMatch = clean.match(/(\d+)\s*เดือน.*?(25\d{2})/);
      if (monthMatch) {
        const months = monthMatch[1]; // 3 / 6 / 9
        const year = monthMatch[2]; // 2568
        return {
          key: `${months}M${year}`,
          label: `งบ ${months} เดือน ${year}`,
        };
      }

      // --- งบปี ---
      const yearMatch = clean.match(/25\d{2}/);
      if (yearMatch) {
        const year = yearMatch[0];
        return {
          key: `FY${year}`,
          label: `งบปี ${year}`,
        };
      }

      // fallback
      return {
        key: clean,
        label: clean,
      };
    };

    // ---------- periods ----------
    const headerRow = rawTable[0];
    const periods: FinancialPeriodDto[] = headerRow.slice(1).map(normalizePeriod);

    // ---------- row key map ----------
    const ROW_KEY_MAP: Record<string, string> = {
      สินทรัพย์รวม: 'totalAssets',
      หนี้สินรวม: 'totalLiabilities',
      ส่วนของผู้ถือหุ้น: 'equity',
      มูลค่าหุ้นที่เรียกชำระแล้ว: 'paidUpCapital',
      รายได้รวม: 'totalRevenue',
      'กำไร (ขาดทุน) จากกิจกรรมอื่น': 'otherProfitLoss',
      กำไรสุทธิ: 'netProfit',
      'กำไรต่อหุ้น (บาท)': 'eps',
      'ROA (%)': 'roa',
      'ROE (%)': 'roe',
      'อัตรากำไรสุทธิ (%)': 'netMargin',
    };

    // ---------- section buckets ----------
    const balanceSheetRows: FinancialRowDto[] = [];
    const ratioRows: FinancialRowDto[] = [];

    let currentSection: 'balance' | 'ratio' | null = null;

    // ---------- iterate rows ----------
    for (let i = 1; i < rawTable.length; i++) {
      const row = rawTable[i];
      const label = row[0]?.trim();

      if (!label) continue;

      if (label.includes('บัญชีทางการเงิน')) {
        currentSection = 'balance';
        continue;
      }

      if (label.includes('อัตราส่วนทางการเงิน')) {
        currentSection = 'ratio';
        continue;
      }

      const rowKey = ROW_KEY_MAP[label];
      if (!rowKey || !currentSection) continue;

      const values: FinancialValueDto[] = periods.map((p, idx) => ({
        periodKey: p.key,
        value: parseNumber(row[idx + 1]),
      }));

      const rowDto: FinancialRowDto = {
        rowKey,
        label,
        values,
      };

      if (currentSection === 'balance') {
        balanceSheetRows.push(rowDto);
      } else {
        ratioRows.push(rowDto);
      }
    }

    // ---------- sections ----------
    const sections: FinancialSectionDto[] = [
      {
        sectionKey: 'key_financials',
        sectionLabel: 'บัญชีทางการเงินที่สำคัญ',
        rows: balanceSheetRows,
      },
      {
        sectionKey: 'financial_ratios',
        sectionLabel: 'อัตราส่วนทางการเงินที่สำคัญ',
        rows: ratioRows,
      },
    ];

    return {
      symbol,
      unit: 'ล้านบาท',
      periods,
      sections,
    };
  }
}
