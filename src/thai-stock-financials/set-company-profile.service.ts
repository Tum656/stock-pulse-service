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
  /**
   * ✅ ดึงข้อมูลจาก block:
   *   <div class="company-info-detail ..."> ... </div>
   *
   * - รอ selector ตัวเดียวให้ครบ
   * - กันหน้าโหลดไม่ครบด้วย waitForFunction แบบ lightweight
   * - ไม่ใช้ waitForTimeout
   */
  async scrapeCompanyProfile(symbol: string): Promise<CompanyProfileResponseDto> {
    const url = `https://www.set.or.th/th/market/product/stock/quote/${symbol}/company-profile/information`;
    const page = await (await this.getBrowser()).newPage();

    try {
      await this.prepareFast(page);

      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      });

      // ✅ รอ text signal ตัวเดียวจบ (แทน selector)
      await page.waitForFunction(() => document.body?.innerText?.includes('ลักษณะธุรกิจ'), { timeout: 30000 });

      const info = await this.extractCompanyInfo(page);

      if (!info?.businessDescription) {
        throw new Error('Company profile not loaded');
      }

      return {
        symbol,
        sourceUrl: url,
        asOf: new Date().toISOString(),
        info,
      };
    } catch (e) {
      this.logger.error(`scrapeCompanyProfile failed: ${symbol}`, e as Error);
      throw e;
    } finally {
      await page.close().catch(() => undefined);
    }
  }

  private async prepareFast(page: Page): Promise<void> {
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

  // =========================
  //  Extract (Only required block)
  // =========================
  private async extractCompanyInfo(page: Page): Promise<CompanyProfileInfoDto | null> {
    return page.evaluate(() => {
      const norm = (s = '') =>
        s
          .replace(/\u00a0/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

      const root = document.querySelector('.company-info-detail');
      if (!root) return null;

      const byLabel = (label: string) => {
        const el = [...root.querySelectorAll('label')].find((x) => norm(x.textContent || '') === label);
        return norm(el?.parentElement?.querySelector('span, a')?.textContent || '');
      };

      const websiteHref = [...root.querySelectorAll('label')]
        .find((x) => norm(x.textContent || '') === 'เว็บไซต์')
        ?.parentElement?.querySelector('a')?.href;

      return {
        businessDescription: norm(root.querySelector('h4 + span')?.textContent || ''),
        address: byLabel('ที่อยู่'),
        phone: byLabel('เบอร์โทรศัพท์'),
        fax: byLabel('เบอร์โทรสาร'),
        website: websiteHref ? norm(websiteHref) : byLabel('เว็บไซต์'),
      };
    });
  }
}
