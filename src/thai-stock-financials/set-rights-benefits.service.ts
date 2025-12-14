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
    return page.evaluate(() => {
      // =========================
      // Helpers
      // =========================
      const norm = (s?: string) =>
        (s ?? '')
          .replace(/\u00a0/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

      const extractSign = (text: string) => text.match(/\b(XD|XR|XW|XB|XM)\b/)?.[1] ?? null;

      const extractDate = (text: string) => text.match(/(\d{1,2}\s*[ก-ฮ]\S*\s*25\d{2})/)?.[1] ?? '';

      const extractAmount = (text: string) => {
        const m = text.match(/(\d+(?:\.\d+)?)\s*บาท/);
        return m ? Number(m[1]) : null;
      };

      // =========================
      // Main
      // =========================
      const results: RightBenefitItemDto[] = [];

      const cards = document.querySelectorAll<HTMLElement>('.accordion-item');

      cards.forEach((card) => {
        // ---------- Header ----------
        const btn = card.querySelector<HTMLElement>('button.accordion-button');
        if (!btn) return;

        const headerText = norm(btn.innerText);
        const sign = extractSign(headerText);
        if (!sign) return;

        const eventDateText = extractDate(headerText);
        const amountValue = extractAmount(headerText);

        // ---------- Body ----------
        const body = card.querySelector<HTMLElement>('.accordion-body');
        if (!body) return;

        const rows = body.querySelectorAll<HTMLElement>('.d-flex.mb-2');

        const rawPairs: { label: string; value: string }[] = [];
        const details: Record<string, string> = {};

        rows.forEach((row) => {
          const label = norm(row.querySelector('label')?.textContent);
          const value = norm(row.querySelector('span')?.textContent);
          if (!label || !value) return;

          rawPairs.push({ label, value });

          const key = label.replace(/\s+/g, '');

          switch (true) {
            case key === 'วันปิดสมุดทะเบียน':
              details.bookCloseDateText = value;
              break;
            case key === 'วันกำหนดรายชื่อผู้ถือหุ้น':
              details.recordDateText = value;
              break;
            case key.startsWith('วันจ่าย'):
              details.paymentDateText = value;
              break;
            case key === 'ประเภท':
              details.benefitTypeText = value;
              break;
            case key.includes('บาท/หุ้น'):
              details.dividendPerShareText = value;
              break;
            case key.includes('รอบผล'):
              details.periodText = value;
              break;
            case key.includes('เงินปันผลจาก'):
              details.dividendFromText = value;
              break;
          }
        });

        results.push({
          eventDateText,
          sign,
          benefitTypeText: details.benefitTypeText ?? '',
          amountText: amountValue !== null ? `${amountValue} บาท` : '',
          amountValue,
          currency: 'THB',
          details,
          rawPairs,
        });
      });

      return results;
    });
  }
}
