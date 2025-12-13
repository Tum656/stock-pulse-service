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
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    );

    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 60000,
    });

    const items = await page.evaluate(() => {
      const norm = (s: string) =>
        (s || '')
          .replace(/\u00a0/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

      const toNumber = (s: string) => (s ? Number(s.replace(/,/g, '')) : null);

      const rows = Array.from(document.querySelectorAll('table tbody tr'));

      return rows.map((tr) => {
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

  // private async extractTable(page: Page): Promise<MajorShareholderItemDto[]> {
  //   return page.evaluate(() => {
  //     const norm = (s: string) =>
  //       (s || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  //
  //     const toNumber = (s: string) =>
  //       s ? Number(s.replace(/,/g, '')) : null;
  //
  //     const rows = Array.from(document.querySelectorAll('table tbody tr'));
  //
  //     const results: any[] = [];
  //
  //     for (const tr of rows) {
  //       const tds = Array.from(tr.querySelectorAll('td')).map(td => norm(td.textContent || ''));
  //
  //       if (tds.length < 4) continue;
  //
  //       results.push({
  //         rank: Number(tds[0]),
  //         name: tds[1],
  //         shares: toNumber(tds[2]),
  //         percent: toNumber(tds[3]),
  //       });
  //     }
  //
  //     return results;
  //   });
  // }
}
