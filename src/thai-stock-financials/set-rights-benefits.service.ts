@Injectable()
export class SetRightsBenefitsService implements OnModuleDestroy {
  private readonly logger = new Logger(SetRightsBenefitsService.name);
  private browser: Browser | null = null;

  async onModuleDestroy() {
    if (this.browser) await this.browser.close().catch(() => undefined);
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
    const url = `https://www.set.or.th/th/market/product/stock/quote/${symbol}/rights-benefits`;
    const page = await (await this.getBrowser()).newPage();

    try {
      await this.preparePage(page);

      await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

      // 👉 short sleep เพื่อให้ accordion hydrate (จำเป็นจริง)
      await new Promise((r) => setTimeout(r, 2500));

      const items = await this.extractItems(page);

      return {
        symbol: symbol.toUpperCase(),
        sourceUrl: url,
        asOf: new Date().toISOString(),
        items,
      };
    } catch (e) {
      this.logger.error(`scrape rights-benefits failed: ${symbol}`, e as Error);
      throw e;
    } finally {
      await page.close().catch(() => undefined);
    }
  }

  // ======================================================
  // PAGE PREP
  // ======================================================
  private async preparePage(page: Page): Promise<void> {
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    );

    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const t = req.resourceType();
      if (t === 'image' || t === 'font' || t === 'media') req.abort();
      else req.continue();
    });
  }

  // ======================================================
  // CORE EXTRACTOR
  // ======================================================
  private async extractItems(page: Page): Promise<RightBenefitItemDto[]> {
    return page.evaluate(() => {
      const norm = (s = '') =>
        s.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();

      const parseHeader = (text: string) => {
        return {
          sign: text.match(/\b(XD|XR|XW|XB|XM)\b/)?.[1] ?? null,
          date: text.match(/(\d{1,2}\s*[ก-ฮ]\S*\s*25\d{2})/)?.[1] ?? '',
          amount: text.match(/(\d+(?:\.\d+)?)\s*บาท/)?.[1],
        };
      };

      const mapDetails = (rows: Element[]) => {
        const details: Record<string, string> = {};
        const rawPairs: { label: string; value: string }[] = [];

        for (const row of rows) {
          const label = norm(row.querySelector('label')?.textContent || '');
          const value = norm(row.querySelector('span')?.textContent || '');
          if (!label || !value) continue;

          rawPairs.push({ label, value });

          const k = label.replace(/\s+/g, '');
          if (k === 'วันปิดสมุดทะเบียน') details.bookCloseDateText = value;
          else if (k === 'วันกำหนดรายชื่อผู้ถือหุ้น') details.recordDateText = value;
          else if (k.startsWith('วันจ่าย')) details.paymentDateText = value;
          else if (k === 'ประเภท') details.benefitTypeText = value;
          else if (k.includes('บาท/หุ้น')) details.dividendPerShareText = value;
          else if (k.includes('รอบผล')) details.periodText = value;
          else if (k.includes('เงินปันผลจาก')) details.dividendFromText = value;
        }

        return { details, rawPairs };
      };

      const results: RightBenefitItemDto[] = [];

      for (const card of document.querySelectorAll('.accordion-item')) {
        const btn = card.querySelector<HTMLButtonElement>('button.accordion-button');
        if (!btn) continue;

        const headerText = norm(btn.innerText);
        const header = parseHeader(headerText);
        if (!header.sign) continue;

        const body = card.querySelector('.accordion-body');
        if (!body) continue;

        const rows = Array.from(body.querySelectorAll('.d-flex.mb-2'));
        const { details, rawPairs } = mapDetails(rows);

        results.push({
          eventDateText: header.date,
          sign: header.sign as any,
          benefitTypeText: details.benefitTypeText ?? '',
          amountText: header.amount ? `${header.amount} บาท` : '',
          amountValue: header.amount ? Number(header.amount) : null,
          currency: 'THB',
          details,
          rawPairs,
        });
      }

      return results;
    });
  }
}
