const axios = require('axios');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');

class ScraperService {
  /**
   * Fetch page HTML using axios (fast, for static pages)
   */
  static async fetchWithAxios(url) {
    const startTime = Date.now();
    const timeout = parseInt(process.env.REQUEST_TIMEOUT) || 30000;

    try {
      const response = await axios.get(url, {
        timeout,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
        },
        maxRedirects: 5,
        validateStatus: (status) => status < 500,
      });

      const loadTime = Date.now() - startTime;

      return {
        html: response.data,
        statusCode: response.status,
        headers: response.headers,
        loadTime,
        finalUrl: response.request?.res?.responseUrl || url,
        redirected: response.request?.res?.responseUrl !== url,
      };
    } catch (error) {
      throw new Error(`Failed to fetch ${url}: ${error.message}`);
    }
  }

  /**
   * Fetch page using Puppeteer (for JS-rendered pages + performance metrics)
   */
  static async fetchWithPuppeteer(url) {
    let browser;
    try {
      browser = await puppeteer.launch({
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
        ],
      });

      const page = await browser.newPage();
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      );

      // Enable performance tracking
      await page.setCacheEnabled(false);

      const startTime = Date.now();
      const response = await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: parseInt(process.env.REQUEST_TIMEOUT) || 30000,
      });
      const loadTime = Date.now() - startTime;

      // Collect performance metrics
      const performanceMetrics = await page.evaluate(() => {
        const timing = performance.timing;
        const paintEntries = performance.getEntriesByType('paint');
        const fcp = paintEntries.find(
          (e) => e.name === 'first-contentful-paint'
        );

        return {
          domContentLoaded: timing.domContentLoadedEventEnd - timing.navigationStart,
          domInteractive: timing.domInteractive - timing.navigationStart,
          fullLoad: timing.loadEventEnd - timing.navigationStart,
          ttfb: timing.responseStart - timing.navigationStart,
          firstContentfulPaint: fcp ? Math.round(fcp.startTime) : null,
          domElements: document.querySelectorAll('*').length,
          documentSize: document.documentElement.outerHTML.length,
        };
      });

      // Check viewport rendering
      const viewportMeta = await page.evaluate(() => {
        const meta = document.querySelector('meta[name="viewport"]');
        return meta ? meta.getAttribute('content') : null;
      });

      // Get mobile-friendliness signals
      const mobileData = await page.evaluate(() => {
        const body = document.body;
        const html = document.documentElement;
        return {
          hasViewportMeta: !!document.querySelector('meta[name="viewport"]'),
          bodyScrollWidth: body.scrollWidth,
          windowInnerWidth: window.innerWidth,
          hasHorizontalScroll: body.scrollWidth > window.innerWidth,
          fontSizes: Array.from(document.querySelectorAll('p, span, li, a, td'))
            .slice(0, 50)
            .map((el) => parseFloat(window.getComputedStyle(el).fontSize)),
          tapTargets: Array.from(
            document.querySelectorAll('a, button, input, select, textarea')
          )
            .slice(0, 50)
            .map((el) => {
              const rect = el.getBoundingClientRect();
              return {
                width: rect.width,
                height: rect.height,
                tag: el.tagName.toLowerCase(),
              };
            }),
        };
      });

      const html = await page.content();
      const statusCode = response.status();

      return {
        html,
        statusCode,
        headers: response.headers(),
        loadTime,
        finalUrl: page.url(),
        redirected: page.url() !== url,
        performanceMetrics,
        viewportMeta,
        mobileData,
      };
    } catch (error) {
      throw new Error(`Puppeteer fetch failed for ${url}: ${error.message}`);
    } finally {
      if (browser) await browser.close();
    }
  }

  /**
   * Parse HTML and extract all SEO-relevant data
   */
  static parseHTML(html, url) {
    const $ = cheerio.load(html);

    return {
      // Meta tags
      meta: this.extractMetaTags($, url),
      // Headings
      headings: this.extractHeadings($),
      // Links
      links: this.extractLinks($, url),
      // Images
      images: this.extractImages($, url),
      // Content
      content: this.extractContent($),
      // Structured data
      structuredData: this.extractStructuredData($),
      // Technical
      technical: this.extractTechnical($, url),
    };
  }

  static extractMetaTags($, url) {
    return {
      title: $('title').text().trim(),
      metaDescription: $('meta[name="description"]').attr('content') || '',
      metaKeywords: $('meta[name="keywords"]').attr('content') || '',
      canonical: $('link[rel="canonical"]').attr('href') || '',
      robots: $('meta[name="robots"]').attr('content') || '',
      // Open Graph
      ogTitle: $('meta[property="og:title"]').attr('content') || '',
      ogDescription: $('meta[property="og:description"]').attr('content') || '',
      ogImage: $('meta[property="og:image"]').attr('content') || '',
      ogType: $('meta[property="og:type"]').attr('content') || '',
      ogUrl: $('meta[property="og:url"]').attr('content') || '',
      ogSiteName: $('meta[property="og:site_name"]').attr('content') || '',
      // Twitter Card
      twitterCard: $('meta[name="twitter:card"]').attr('content') || '',
      twitterTitle: $('meta[name="twitter:title"]').attr('content') || '',
      twitterDescription:
        $('meta[name="twitter:description"]').attr('content') || '',
      twitterImage: $('meta[name="twitter:image"]').attr('content') || '',
      // Other important meta
      charset:
        $('meta[charset]').attr('charset') ||
        $('meta[http-equiv="Content-Type"]').attr('content') ||
        '',
      language: $('html').attr('lang') || '',
      favicon:
        $('link[rel="icon"]').attr('href') ||
        $('link[rel="shortcut icon"]').attr('href') ||
        '',
    };
  }

  static extractHeadings($) {
    const headings = {};
    for (let i = 1; i <= 6; i++) {
      headings[`h${i}`] = [];
      $(`h${i}`).each((_, el) => {
        headings[`h${i}`].push($(el).text().trim());
      });
    }
    return headings;
  }

  static extractLinks($, baseUrl) {
    const internal = [];
    const external = [];
    const broken = [];

    $('a[href]').each((_, el) => {
      const href = $(el).attr('href') || '';
      const text = $(el).text().trim();
      const rel = $(el).attr('rel') || '';
      const nofollow = rel.includes('nofollow');

      if (
        href.startsWith('#') ||
        href.startsWith('mailto:') ||
        href.startsWith('tel:') ||
        href.startsWith('javascript:')
      ) {
        return;
      }

      try {
        const absoluteUrl = new URL(href, baseUrl).href;
        const baseHost = new URL(baseUrl).hostname;
        const linkHost = new URL(absoluteUrl).hostname;

        const linkData = {
          url: absoluteUrl,
          text: text || '[No anchor text]',
          nofollow,
          rel,
        };

        if (linkHost === baseHost) {
          internal.push(linkData);
        } else {
          external.push(linkData);
        }
      } catch {
        broken.push({ url: href, text, reason: 'Invalid URL' });
      }
    });

    return { internal, external, broken };
  }

  static extractImages($, baseUrl) {
    const images = [];
    $('img').each((_, el) => {
      const src = $(el).attr('src') || '';
      const alt = $(el).attr('alt');
      const title = $(el).attr('title') || '';
      const width = $(el).attr('width') || '';
      const height = $(el).attr('height') || '';
      const loading = $(el).attr('loading') || '';

      let absoluteSrc = src;
      try {
        absoluteSrc = new URL(src, baseUrl).href;
      } catch {}

      images.push({
        src: absoluteSrc,
        alt: alt !== undefined ? alt : null,
        hasAlt: alt !== undefined && alt !== null,
        altEmpty: alt === '',
        title,
        hasDimensions: !!(width && height),
        lazyLoaded: loading === 'lazy',
      });
    });
    return images;
  }

  static extractContent($) {
    // Remove script and style tags for content analysis
    const $clone = cheerio.load($.html());
    $clone('script, style, noscript').remove();

    const bodyText = $clone('body').text().replace(/\s+/g, ' ').trim();
    const words = bodyText
      .split(/\s+/)
      .filter((w) => w.length > 0);

    // Word frequency analysis
    const wordFreq = {};
    words.forEach((word) => {
      const clean = word.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (clean.length > 2) {
        wordFreq[clean] = (wordFreq[clean] || 0) + 1;
      }
    });

    // Get top keywords (excluding common stop words)
    const stopWords = new Set([
      'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can',
      'had', 'her', 'was', 'one', 'our', 'out', 'has', 'have', 'been',
      'from', 'that', 'this', 'with', 'they', 'will', 'each', 'which',
      'their', 'there', 'what', 'about', 'would', 'make', 'like', 'just',
      'over', 'such', 'than', 'them', 'very', 'when', 'come', 'could',
      'into', 'some', 'other', 'more', 'also', 'its', 'only',
    ]);

    const topKeywords = Object.entries(wordFreq)
      .filter(([word]) => !stopWords.has(word))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([word, count]) => ({
        word,
        count,
        density: ((count / words.length) * 100).toFixed(2),
      }));

    return {
      wordCount: words.length,
      characterCount: bodyText.length,
      paragraphCount: $('p').length,
      topKeywords,
      readingTime: Math.ceil(words.length / 200), // avg 200 wpm
    };
  }

  static extractStructuredData($) {
    const schemas = [];
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const data = JSON.parse($(el).html());
        schemas.push(data);
      } catch {}
    });
    return {
      hasSchema: schemas.length > 0,
      schemas,
      schemaTypes: schemas.map((s) => s['@type'] || 'Unknown'),
    };
  }

  static extractTechnical($, url) {
    return {
      hasDoctype: $.html().toLowerCase().startsWith('<!doctype'),
      hasHtmlLang: !!$('html').attr('lang'),
      htmlLang: $('html').attr('lang') || '',
      hasCharset:
        !!$('meta[charset]').length ||
        !!$('meta[http-equiv="Content-Type"]').length,
      scriptsCount: $('script').length,
      stylesheetsCount: $('link[rel="stylesheet"]').length,
      inlineStylesCount: $('[style]').length,
      iframesCount: $('iframe').length,
      formsCount: $('form').length,
      hasRobotsTxt: null, // checked separately
      hasSitemap: null,   // checked separately
      hasSSL: url.startsWith('https'),
      hasFavicon:
        !!$('link[rel="icon"]').length ||
        !!$('link[rel="shortcut icon"]').length,
    };
  }
}

module.exports = ScraperService;
