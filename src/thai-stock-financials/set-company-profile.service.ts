import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import puppeteer, { Browser, Page } from 'puppeteer';
import { CompanyProfileResponseDto } from './dto/company-profileInfo/companyProfileResponse.dto';
import { CompanyProfileInfoDto } from './dto/company-profileInfo/companyProfileInfo.dto';

@Injectable()
export class SetCompanyProfileService implements OnModuleDestroy {
  private readonly logger = new Logger(SetCompanyProfileService.name);
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

  private buildUrl(symbol: string): string {
    return `https://www.set.or.th/th/market/product/stock/quote/${symbol}/company-profile/information`;
  }

  /**
   * ✅ ดึงข้อมูลจาก block:
   *   <div class="company-info-detail ..."> ... </div>
   *
   * - รอ selector ตัวเดียวให้ครบ
   * - กันหน้าโหลดไม่ครบด้วย waitForFunction แบบ lightweight
   * - ไม่ใช้ waitForTimeout
   */
  async scrapeCompanyProfile(symbol: string): Promise<CompanyProfileResponseDto> {
    const url = this.buildUrl(symbol);

    const browser = await this.getBrowser();
    const page = await browser.newPage();

    try {
      await this.hardenPage(page);

      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      });

      // 1) รอให้ block company info โผล่
      await this.waitForCompanyInfoBlock(page, 30000);

      // 2) ดึงข้อมูลจาก DOM เฉพาะส่วนที่ต้องการ
      const info = await this.extractCompanyInfo(page);

      // 3) กันกรณี SET เปลี่ยน DOM / ได้ null
      if (!info) {
        throw new Error('Company info block not found or empty (company-info-detail)');
      }

      return {
        symbol: symbol,
        sourceUrl: url,
        asOf: new Date().toISOString(),
        info,
      };
    } catch (err) {
      this.logger.error(`scrapeCompanyProfile failed for ${symbol}`, err as Error);
      throw err;
    } finally {
      await page.close().catch(() => undefined);
    }
  }

  // =========================
  //  Performance / Harden
  // =========================
  private async hardenPage(page: Page): Promise<void> {
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    );

    // บล็อก resource หนัก ๆ ให้เร็วขึ้น แต่ยังให้ JS/CSS ทำงาน
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const rt = req.resourceType();
      if (['image', 'font', 'media'].includes(rt)) req.abort();
      else req.continue();
    });
  }

  // =========================
  //  Wait (No waitForTimeout)
  // =========================
  private async waitForCompanyInfoBlock(page: Page, timeoutMs: number): Promise<void> {
    // รอ selector ก่อน (เร็วและชัด)
    await page.waitForSelector('.company-info-detail', { timeout: timeoutMs });

    // กันกรณี block โผล่แล้ว แต่ข้อความยังไม่ถูก hydrate (Vue/React)
    await page.waitForFunction(
      () => {
        const root = document.querySelector('.company-info-detail');
        if (!root) return false;

        const h4 = root.querySelector('h4');
        if (!h4) return false;

        const title = (h4.textContent || '').trim();
        // ที่คุณยกตัวอย่าง: "ลักษณะธุรกิจ"
        // แต่เผื่ออนาคตมีเปลี่ยน/มีช่องว่าง
        const okTitle = title.includes('ลักษณะธุรกิจ');

        // ข้อความอธิบายส่วนใหญ่เป็น h4 + span
        const desc = root.querySelector('h4 + span')?.textContent || '';
        const okDesc = desc.replace(/\s+/g, ' ').trim().length > 0;

        return okTitle && okDesc;
      },
      { timeout: timeoutMs },
    );
  }

  // =========================
  //  Extract (Only required block)
  // =========================
  private async extractCompanyInfo(page: Page): Promise<CompanyProfileInfoDto | null> {
    return page.evaluate(() => {
      const norm = (s: string) =>
        (s || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();

      const root = document.querySelector('.company-info-detail');
      if (!root) return null;

      // --- 1) Business Description (ลักษณะธุรกิจ) ---
      // โครงสร้างจาก HTML ที่คุณให้: <h4>...</h4> <span>คำอธิบาย</span>
      const businessDescription = norm(root.querySelector('h4 + span')?.textContent || '');

      // --- helper: ดึงค่าจาก label ---
      // โครง HTML จะเป็น:
      // <div ...><label>ที่อยู่</label> <span>...</span></div>
      // หรือ website จะเป็น <a href="...">...</a>
      const getByLabel = (labelText: string) => {
        const labels = Array.from(root.querySelectorAll('label'));
        const label = labels.find((l) => norm(l.textContent || '') === labelText);
        if (!label) return undefined;

        // ค่าอยู่ใน container เดียวกัน (parent)
        const container = label.parentElement;
        if (!container) return undefined;

        const valueEl = container.querySelector('span, a');
        if (!valueEl) return undefined;

        return norm(valueEl.textContent || '');
      };

      // --- 2) Fields ---
      const address = getByLabel('ที่อยู่');
      const phone = getByLabel('เบอร์โทรศัพท์');
      const fax = getByLabel('เบอร์โทรสาร');

      // website ในตัวอย่างเป็น <a href=...>http://...</a>
      // เอา textContent ก็พอ (อ่านง่าย) หรือเอา href ก็ได้
      const websiteText = getByLabel('เว็บไซต์');

      // ถ้าต้องการเอา href แบบชัวร์:
      const websiteHref = (() => {
        const labelEls = Array.from(root.querySelectorAll('label'));
        const label = labelEls.find((l) => norm(l.textContent || '') === 'เว็บไซต์');
        const container = label?.parentElement;
        const a = container?.querySelector('a[href]') as HTMLAnchorElement | null;
        return a?.href ? norm(a.href) : undefined;
      })();

      return {
        businessDescription,
        address,
        phone,
        fax,
        // เลือกใช้ href ก่อน (ถ้ามี) ไม่งั้นใช้ text
        website: websiteHref || websiteText,
      };
    });
  }
}
