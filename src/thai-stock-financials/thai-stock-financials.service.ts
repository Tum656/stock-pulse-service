import { Injectable, Logger } from '@nestjs/common';
import puppeteer from 'puppeteer';
import { ThaiStockFinancialsResponseDto } from './dto/ThaiStockFinancialsResponse.dto';
import { FinancialPeriodDto } from './dto/FinancialPeriod.dto';
import { FinancialRowDto } from './dto/FinancialRow.dto';
import { FinancialValueDto } from './dto/FinancialValue.dto';
import { FinancialSectionDto } from './dto/FinancialSection.dto';

@Injectable()
export class SetHighlightScraperService {
  private readonly logger = new Logger(SetHighlightScraperService.name);

  async scrapeBtsHighlights(symbol: string) {
    const url = `https://www.set.or.th/th/market/product/stock/quote/${symbol}/financial-statement/company-highlights`;

    const browser = await puppeteer.launch({
      headless: true, // ✅ แก้ตรงนี้
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();

      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36');

      await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: 60000,
      });

      await page.waitForSelector('table', { timeout: 30000 });

      const table = await page.evaluate(() => {
        const tables = Array.from(document.querySelectorAll('table'));
        const target = tables.find(
          (t) =>
            t.innerText.includes('สินทรัพย์รวม') &&
            t.innerText.includes('หนี้สินรวม') &&
            t.innerText.includes('กำไรสุทธิ'),
        );

        if (!target) {
          throw new Error('Key Financials table not found');
        }

        return Array.from(target.querySelectorAll('tr')).map((tr) =>
          Array.from(tr.querySelectorAll('th,td')).map((td) => td.textContent?.trim() ?? ''),
        );
      });

      return this.mapRawTableToDto(symbol, table);
    } finally {
      await browser.close();
    }
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

      if (clean.includes('9 เดือน')) {
        const y = clean.match(/25\d{2}/)?.[0];
        return { key: `9M${y}`, label: `งบ 9 เดือน ${y}` };
      }

      if (clean.includes('งบปี')) {
        const y = clean.match(/25\d{2}/)?.[0];
        return { key: y!, label: `งบปี ${y}` };
      }

      return { key: clean, label: clean };
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
