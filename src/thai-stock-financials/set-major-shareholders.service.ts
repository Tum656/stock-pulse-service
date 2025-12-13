import { Injectable, OnModuleDestroy } from '@nestjs/common';
import puppeteer, { Browser } from 'puppeteer';
import { MajorShareholdersResponseDto } from './dto/major-shareholders/MajorShareholdersResponse.dto';

@Injectable()
export class SetMajorShareholdersService implements OnModuleDestroy {
  private browser: Browser | null = null;

  async onModuleDestroy() {
    if (this.browser) await this.browser.close();
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

  async scrape(symbol: string): Promise<MajorShareholdersResponseDto> {
    const browser = await this.getBrowser();
    const page = await browser.newPage();

    const url = `https://www.set.or.th/th/market/product/stock/quote/${symbol}/major-shareholders`;

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
    );

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // ✅ รอจน table หลักปรากฏจริง
    await page.waitForSelector('.table-custom-field-main .table-custom-field--cnc tbody tr', { timeout: 30000 });

    const items = await page.evaluate(() => {
      const norm = (s: string) =>
        (s || '')
          .replace(/\u00a0/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

      const toNumber = (s: string) => (s ? Number(s.replace(/,/g, '')) : null);

      const table = document.querySelector('.table-custom-field-main .table-custom-field--cnc');

      if (!table) return [];

      const rows = table.querySelectorAll('tbody tr');

      return Array.from(rows).map((tr) => {
        const tds = Array.from(tr.querySelectorAll('td')).map((td) => norm(td.textContent || ''));

        return {
          rank: Number(tds[0]),
          name: tds[1],
          shares: toNumber(tds[2]),
          percent: toNumber(tds[3]),
        };
      });
    });

    await page.close();

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
  }
}
