import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import puppeteer, { Browser, Page } from 'puppeteer';

import { RightsBenefitsResponseDto } from './dto/rights-benefits/RightsBenefitsResponse.dto';
import { RightBenefitItemDto } from './dto/rights-benefits/RightBenefitItem.dto';

@Injectable()
export class SetRightsBenefitsService implements OnModuleDestroy {
  private readonly logger = new Logger(SetRightsBenefitsService.name);
  private browser: Browser | null = null;

  async onModuleDestroy() {
    if (this.browser) {
      await this.browser.close();
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
  async scrape(symbol: string): Promise<RightsBenefitsResponseDto> {
    const browser = await this.getBrowser();
    const page = await browser.newPage();

    const url = `https://www.set.or.th/th/market/product/stock/quote/${symbol}/rights-benefits`;

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    );

    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 60000,
    });

    // 🔥 sleep แบบ native (ไม่มี TS error)
    await new Promise((r) => setTimeout(r, 4000));

    const items = await this.extractItems(page);

    await page.close();

    return {
      symbol: symbol.toUpperCase(),
      sourceUrl: url,
      asOf: new Date().toISOString(),
      items,
    };
  }

  // ======================================================
  // CORE EXTRACTOR (ตรง HTML ที่คุณให้)
  // ======================================================
  private async extractItems(page: Page): Promise<RightBenefitItemDto[]> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return page.evaluate(() => {
      const norm = (s: string) =>
        (s || '')
          .replace(/\u00a0/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

      const results: any[] = [];

      const cards = Array.from(document.querySelectorAll('.accordion-item'));

      for (const card of cards) {
        // =========================
        // HEADER
        // =========================
        const btn = card.querySelector('button.accordion-button') as HTMLElement | null;
        if (!btn) continue;

        const headerText = norm(btn.innerText);

        const signMatch = headerText.match(/\b(XD|XR|XW|XB|XM)\b/);
        if (!signMatch) continue;

        const sign = signMatch[1];

        const dateMatch = headerText.match(/(\d{1,2}\s*[ก-ฮ]\S*\s*25\d{2})/);
        const amountMatch = headerText.match(/(\d+(?:\.\d+)?)\s*บาท/);

        // =========================
        // DETAILS
        // =========================
        const body = card.querySelector('.accordion-body');
        if (!body) continue;

        const rows = Array.from(body.querySelectorAll('.d-flex.mb-2'));

        const rawPairs: any[] = [];
        const details: any = {};

        for (const row of rows) {
          const labelEl = row.querySelector('label');
          const valueEl = row.querySelector('span');

          if (!labelEl || !valueEl) continue;

          const label = norm(labelEl.textContent || '');
          const value = norm(valueEl.textContent || '');

          rawPairs.push({ label, value });

          const k = label.replace(/\s+/g, '');
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          if (k === 'วันปิดสมุดทะเบียน') details.bookCloseDateText = value;
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          else if (k === 'วันกำหนดรายชื่อผู้ถือหุ้น') details.recordDateText = value;
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          else if (k.startsWith('วันจ่าย')) details.paymentDateText = value;
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          else if (k === 'ประเภท') details.benefitTypeText = value;
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          else if (k.includes('บาท/หุ้น')) details.dividendPerShareText = value;
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          else if (k.includes('รอบผล')) details.periodText = value;
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          else if (k.includes('เงินปันผลจาก')) details.dividendFromText = value;
        }

        results.push({
          eventDateText: dateMatch?.[1] ?? '',
          sign,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-unsafe-member-access
          benefitTypeText: details.benefitTypeText ?? '',
          amountText: amountMatch ? `${amountMatch[1]} บาท` : '',
          amountValue: amountMatch ? Number(amountMatch[1]) : null,
          currency: 'THB',
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          details,
          rawPairs,
        });
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return results;
    });
  }
}
