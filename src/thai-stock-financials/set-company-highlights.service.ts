import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import puppeteer, { Browser, Page } from 'puppeteer';
import { SetCompanyHighlightsResponseDto } from './dto/company-highlights/CompanyHighlightsResponse.dto';

@Injectable()
export class SetCompanyHighlightsService implements OnModuleDestroy {
  private readonly logger = new Logger(SetCompanyHighlightsService.name);
  private browser: Browser | null = null;

  // =========================
  // Lifecycle
  // =========================
  async onModuleDestroy() {
    if (this.browser) {
      await this.browser.close().catch(() => undefined);
      this.browser = null;
    }
  }

  // =========================
  // Browser (reuse)
  // =========================
  private async getBrowser(): Promise<Browser> {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
    }
    return this.browser;
  }

  private buildUrl(symbol: string): string {
    return `https://www.set.or.th/th/market/product/stock/quote/${symbol}/financial-statement/company-highlights`;
  }

  // =========================
  // Public API
  // =========================
  async scrape(symbol: string): Promise<SetCompanyHighlightsResponseDto> {
    const url = this.buildUrl(symbol);
    const browser = await this.getBrowser();
    const page = await browser.newPage();

    try {
      await this.preparePage(page);
      await this.gotoAndWait(page, url);

      const data = await this.extractCompanyHighlights(page);

      return {
        symbol: symbol.toUpperCase(),
        sourceUrl: url,
        asOf: new Date().toISOString(),
        ...data,
      };
    } catch (err) {
      this.logger.error(`scrape company-highlights failed: ${symbol}`, err as Error);
      throw err;
    } finally {
      await page.close().catch(() => undefined);
    }
  }

  // =========================
  // Page setup
  // =========================
  private async preparePage(page: Page): Promise<void> {
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
    );

    // เร็ว + เสถียร
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const type = req.resourceType();
      if (['image', 'font', 'media'].includes(type)) req.abort();
      else req.continue();
    });
  }

  private async gotoAndWait(page: Page, url: string): Promise<void> {
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    // ตัวนี้สำคัญมากสำหรับหน้านี้
    await page.waitForSelector('.table-custom-field--cnc', {
      timeout: 30000,
    });
  }

  // =========================
  // Extract
  // =========================
  private async extractCompanyHighlights(page: Page) {
    return page.evaluate(() => {
      const norm = (s: string) =>
        (s || '')
          .replace(/\u00a0/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

      const toNum = (s: string) => {
        const v = norm(s).replace(/,/g, '');
        return v && v !== '-' ? Number(v) : null;
      };

      // -------------------------
      // UNIT
      // -------------------------
      const unit = document.querySelector('.tab-content .unit span')?.textContent?.replace('หน่วย :', '').trim() ?? '';

      // -------------------------
      // HIGHLIGHTS (งบ + อัตราส่วน)
      // -------------------------
      const highlightTable = document.querySelector('.table-custom-field-main.table-turnover .table-custom-field--cnc');

      const periods: any[] = [];

      if (highlightTable) {
        const headers = Array.from(highlightTable.querySelectorAll('thead th')).slice(1);

        headers.forEach((th) => {
          periods.push({
            periodLabel: norm(th.querySelector('.head-year')?.textContent || ''),
            periodRange: norm(th.querySelector('.head-date')?.textContent || ''),
            financialAccounts: [],
            financialRatios: [],
          });
        });

        let section: 'accounts' | 'ratios' = 'accounts';

        highlightTable.querySelectorAll('tbody tr').forEach((tr) => {
          if (tr.classList.contains('row-header')) {
            const title = norm(tr.textContent || '');
            if (title.includes('อัตราส่วน')) section = 'ratios';
            return;
          }

          const label = norm(tr.querySelector('td:first-child')?.textContent || '');
          if (!label) return;

          const values = Array.from(tr.querySelectorAll('td'))
            .slice(1)
            .map((td) => toNum(td.textContent || ''));

          values.forEach((val, i) => {
            const metric = { label, value: val };
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-member-access
            if (section === 'accounts') periods[i].financialAccounts.push(metric);
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-member-access
            else periods[i].financialRatios.push(metric);
          });
        });
      }

      // -------------------------
      // TRADING STATS
      // -------------------------
      const tradingTable = document.querySelector(
        '.table-custom-field-main.table-tradingstat .table-custom-field--cnc',
      );

      const tradingPeriods: any[] = [];

      if (tradingTable) {
        const headers = Array.from(tradingTable.querySelectorAll('thead th')).slice(1);

        headers.forEach((th) => {
          tradingPeriods.push({
            periodLabel: norm(th.textContent || ''),
            financialStatementAsOf: undefined,
            metrics: [],
          });
        });

        tradingTable.querySelectorAll('tbody tr').forEach((tr) => {
          const label = norm(tr.querySelector('td:first-child')?.textContent || '');

          if (label.includes('วันที่ของงบการเงิน')) {
            Array.from(tr.querySelectorAll('td'))
              .slice(1)
              .forEach((td, i) => {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                tradingPeriods[i].financialStatementAsOf = norm(td.textContent || '');
              });
            return;
          }

          const values = Array.from(tr.querySelectorAll('td'))
            .slice(1)
            .map((td) => toNum(td.textContent || ''));

          values.forEach((val, i) => {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-member-access
            tradingPeriods[i].metrics.push({ label, value: val });
          });
        });
      }

      return {
        highlights: { unit, periods },
        tradingStats: { periods: tradingPeriods },
      };
    });
  }
}
