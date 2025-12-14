import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import puppeteer, { Browser, Page } from 'puppeteer';
import { MajorShareholdersResponseDto } from './dto/major-shareholders/MajorShareholdersResponse.dto';

type MajorShareholderItem = {
  rank: number;
  name: string;
  shares: number | null;
  percent: number | null;
};

@Injectable()
export class SetMajorShareholdersService implements OnModuleDestroy {
  private readonly logger = new Logger(SetMajorShareholdersService.name);
  private browser: Browser | null = null;

  async onModuleDestroy() {
    if (this.browser) {
      await this.browser.close().catch(() => undefined);
      this.browser = null;
    }
  }

  private async getBrowser(): Promise<Browser> {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
    }
    return this.browser;
  }

  // ======================================================
  // ENTRY
  // ======================================================
  async scrape(symbol: string): Promise<MajorShareholdersResponseDto> {
    const url = `https://www.set.or.th/th/market/product/stock/quote/${symbol}/major-shareholders`;
    const page = await (await this.getBrowser()).newPage();

    try {
      await this.preparePage(page);

      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      });

      // รอเฉพาะ table จริง (เร็วและชัวร์)
      await page.waitForSelector('.table-custom-field-main .table-custom-field--cnc tbody tr', { timeout: 30000 });

      const items = await this.extractItems(page);

      return {
        symbol: symbol.toUpperCase(),
        sourceUrl: url,
        asOf: new Date().toISOString(),
        meta: {
          totalHolders: items.length,
          unit: 'shares',
          percentUnit: '%',
        },
        items,
      };
    } catch (err) {
      this.logger.error(`scrape major-shareholders failed: ${symbol}`, err as Error);
      throw err;
    } finally {
      await page.close().catch(() => undefined);
    }
  }

  // ======================================================
  // PAGE PREP (FAST)
  // ======================================================
  private async preparePage(page: Page): Promise<void> {
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
    );

    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const t = req.resourceType();
      if (t === 'image' || t === 'font' || t === 'media') req.abort();
      else req.continue();
    });
  }

  // ======================================================
  // CORE EXTRACTOR (HTML ตรง)
  // ======================================================
  private async extractItems(page: Page): Promise<MajorShareholderItem[]> {
    return page.evaluate(() => {
      const norm = (s = '') =>
        s
          .replace(/\u00a0/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

      const toNumber = (s: string) => {
        const v = s.replace(/,/g, '');
        return v ? Number(v) : null;
      };

      const table = document.querySelector<HTMLTableElement>('.table-custom-field-main .table-custom-field--cnc');
      if (!table) return [];

      const rows = Array.from(table.querySelectorAll('tbody tr'));

      return rows.map((tr) => {
        const cells = Array.from(tr.querySelectorAll('td')).map((td) => norm(td.textContent || ''));

        return {
          rank: Number(cells[0]),
          name: cells[1],
          shares: toNumber(cells[2]),
          percent: toNumber(cells[3]),
        };
      });
    });
  }
}
