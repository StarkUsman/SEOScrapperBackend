const axios = require('axios');

class AnalyzerService {
  /**
   * Run complete SEO analysis on parsed page data
   */
  static analyze(parsedData, fetchResult) {
    const results = {
      meta: this.analyzeMeta(parsedData.meta),
      headings: this.analyzeHeadings(parsedData.headings),
      performance: this.analyzePerformance(fetchResult),
      keywords: this.analyzeKeywords(parsedData.content, parsedData.meta),
      links: this.analyzeLinks(parsedData.links),
      images: this.analyzeImages(parsedData.images),
      mobile: this.analyzeMobile(fetchResult),
      accessibility: this.analyzeAccessibility(parsedData, fetchResult),
      technical: this.analyzeTechnical(parsedData.technical, parsedData.structuredData),
    };

    // Calculate overall score
    results.overallScore = this.calculateOverallScore(results);

    return results;
  }

  // ─── Meta Tags Analysis ────────────────────────────────────────
  static analyzeMeta(meta) {
    const issues = [];
    const warnings = [];
    const passed = [];
    let score = 100;

    // Title
    if (!meta.title) {
      issues.push({ message: 'Missing page title', impact: 'critical' });
      score -= 20;
    } else if (meta.title.length < 30) {
      warnings.push({ message: `Title too short (${meta.title.length} chars). Aim for 50-60 characters.`, impact: 'moderate' });
      score -= 5;
    } else if (meta.title.length > 60) {
      warnings.push({ message: `Title too long (${meta.title.length} chars). Google may truncate it. Aim for 50-60 characters.`, impact: 'moderate' });
      score -= 5;
    } else {
      passed.push('Title length is optimal');
    }

    // Meta Description
    if (!meta.metaDescription) {
      issues.push({ message: 'Missing meta description', impact: 'critical' });
      score -= 15;
    } else if (meta.metaDescription.length < 120) {
      warnings.push({ message: `Meta description too short (${meta.metaDescription.length} chars). Aim for 150-160 characters.`, impact: 'moderate' });
      score -= 5;
    } else if (meta.metaDescription.length > 160) {
      warnings.push({ message: `Meta description too long (${meta.metaDescription.length} chars). May be truncated. Aim for 150-160 characters.`, impact: 'low' });
      score -= 3;
    } else {
      passed.push('Meta description length is optimal');
    }

    // Canonical
    if (meta.canonical) {
      passed.push('Canonical URL is set');
    } else {
      warnings.push({ message: 'No canonical URL specified', impact: 'moderate' });
      score -= 5;
    }

    // Open Graph
    const ogTags = ['ogTitle', 'ogDescription', 'ogImage', 'ogType'];
    const missingOg = ogTags.filter((tag) => !meta[tag]);
    if (missingOg.length === 0) {
      passed.push('All essential Open Graph tags present');
    } else if (missingOg.length <= 2) {
      warnings.push({ message: `Missing OG tags: ${missingOg.join(', ')}`, impact: 'low' });
      score -= 3;
    } else {
      issues.push({ message: `Missing ${missingOg.length} Open Graph tags. Social sharing will be limited.`, impact: 'moderate' });
      score -= 8;
    }

    // Twitter Card
    if (meta.twitterCard) {
      passed.push('Twitter Card tags present');
    } else {
      warnings.push({ message: 'No Twitter Card tags found', impact: 'low' });
      score -= 2;
    }

    // Language
    if (meta.language) {
      passed.push(`HTML lang attribute set: "${meta.language}"`);
    } else {
      issues.push({ message: 'Missing HTML lang attribute', impact: 'moderate' });
      score -= 5;
    }

    // Favicon
    if (meta.favicon) {
      passed.push('Favicon is set');
    } else {
      warnings.push({ message: 'No favicon found', impact: 'low' });
      score -= 2;
    }

    return {
      score: Math.max(0, score),
      data: meta,
      issues,
      warnings,
      passed,
    };
  }

  // ─── Headings Analysis ─────────────────────────────────────────
  static analyzeHeadings(headings) {
    const issues = [];
    const warnings = [];
    const passed = [];
    let score = 100;

    // H1 checks
    if (headings.h1.length === 0) {
      issues.push({ message: 'No H1 heading found. Every page should have exactly one H1.', impact: 'critical' });
      score -= 25;
    } else if (headings.h1.length > 1) {
      warnings.push({ message: `Multiple H1 headings found (${headings.h1.length}). Use only one H1 per page.`, impact: 'moderate' });
      score -= 10;
    } else {
      passed.push('Exactly one H1 heading found');
      if (headings.h1[0].length > 70) {
        warnings.push({ message: 'H1 is very long. Keep it concise and keyword-rich.', impact: 'low' });
        score -= 3;
      }
    }

    // Heading hierarchy
    const headingOrder = [];
    for (let i = 1; i <= 6; i++) {
      if (headings[`h${i}`].length > 0) {
        headingOrder.push(i);
      }
    }

    let hierarchyBroken = false;
    for (let i = 1; i < headingOrder.length; i++) {
      if (headingOrder[i] - headingOrder[i - 1] > 1) {
        hierarchyBroken = true;
        break;
      }
    }

    if (hierarchyBroken) {
      warnings.push({ message: 'Heading hierarchy is not sequential (e.g., skipping from H2 to H4)', impact: 'moderate' });
      score -= 10;
    } else if (headingOrder.length > 1) {
      passed.push('Heading hierarchy is properly structured');
    }

    // H2 count
    if (headings.h2.length === 0 && headings.h1.length > 0) {
      warnings.push({ message: 'No H2 headings found. Use H2s to structure your content sections.', impact: 'moderate' });
      score -= 5;
    } else if (headings.h2.length >= 2) {
      passed.push(`Good use of H2 headings (${headings.h2.length} found)`);
    }

    // Total headings
    const totalHeadings = Object.values(headings).reduce((sum, arr) => sum + arr.length, 0);
    if (totalHeadings < 3) {
      warnings.push({ message: 'Very few headings used. Content structure could be improved.', impact: 'low' });
      score -= 5;
    }

    // Duplicate headings
    const allHeadingTexts = Object.values(headings).flat();
    const duplicates = allHeadingTexts.filter(
      (h, i) => allHeadingTexts.indexOf(h) !== i
    );
    if (duplicates.length > 0) {
      warnings.push({ message: `Duplicate headings found: "${duplicates[0]}"`, impact: 'low' });
      score -= 3;
    }

    return {
      score: Math.max(0, score),
      data: headings,
      summary: {
        total: totalHeadings,
        counts: Object.fromEntries(
          Object.entries(headings).map(([k, v]) => [k, v.length])
        ),
      },
      issues,
      warnings,
      passed,
    };
  }

  // ─── Performance Analysis ──────────────────────────────────────
  static analyzePerformance(fetchResult) {
    const issues = [];
    const warnings = [];
    const passed = [];
    let score = 100;

    const metrics = fetchResult.performanceMetrics || {};
    const loadTime = fetchResult.loadTime || 0;

    // Page load time
    if (loadTime < 1000) {
      passed.push(`Excellent load time: ${loadTime}ms`);
    } else if (loadTime < 3000) {
      passed.push(`Good load time: ${loadTime}ms`);
      score -= 5;
    } else if (loadTime < 5000) {
      warnings.push({ message: `Slow load time: ${loadTime}ms. Aim for under 3 seconds.`, impact: 'moderate' });
      score -= 15;
    } else {
      issues.push({ message: `Very slow load time: ${loadTime}ms. This severely impacts SEO and UX.`, impact: 'critical' });
      score -= 30;
    }

    // TTFB
    if (metrics.ttfb) {
      if (metrics.ttfb < 200) {
        passed.push(`Excellent TTFB: ${metrics.ttfb}ms`);
      } else if (metrics.ttfb < 600) {
        passed.push(`Good TTFB: ${metrics.ttfb}ms`);
      } else {
        warnings.push({ message: `High TTFB: ${metrics.ttfb}ms. Server response is slow.`, impact: 'moderate' });
        score -= 10;
      }
    }

    // First Contentful Paint
    if (metrics.firstContentfulPaint) {
      if (metrics.firstContentfulPaint < 1800) {
        passed.push(`Good FCP: ${metrics.firstContentfulPaint}ms`);
      } else if (metrics.firstContentfulPaint < 3000) {
        warnings.push({ message: `Moderate FCP: ${metrics.firstContentfulPaint}ms. Aim for under 1.8s.`, impact: 'moderate' });
        score -= 10;
      } else {
        issues.push({ message: `Poor FCP: ${metrics.firstContentfulPaint}ms. Content takes too long to appear.`, impact: 'critical' });
        score -= 20;
      }
    }

    // DOM size
    if (metrics.domElements) {
      if (metrics.domElements > 1500) {
        warnings.push({ message: `Large DOM: ${metrics.domElements} elements. Consider simplifying the page structure.`, impact: 'moderate' });
        score -= 10;
      } else {
        passed.push(`DOM size is reasonable: ${metrics.domElements} elements`);
      }
    }

    // Document size
    if (metrics.documentSize) {
      const sizeKB = Math.round(metrics.documentSize / 1024);
      if (sizeKB > 500) {
        warnings.push({ message: `Large HTML document: ${sizeKB}KB. Consider reducing page size.`, impact: 'moderate' });
        score -= 5;
      } else {
        passed.push(`HTML document size: ${sizeKB}KB`);
      }
    }

    // SSL check
    if (fetchResult.finalUrl && fetchResult.finalUrl.startsWith('https')) {
      passed.push('Page is served over HTTPS');
    } else {
      issues.push({ message: 'Page is not served over HTTPS. This impacts SEO rankings.', impact: 'critical' });
      score -= 20;
    }

    return {
      score: Math.max(0, score),
      data: {
        loadTime,
        ttfb: metrics.ttfb || null,
        fcp: metrics.firstContentfulPaint || null,
        domContentLoaded: metrics.domContentLoaded || null,
        domElements: metrics.domElements || null,
        documentSize: metrics.documentSize || null,
        statusCode: fetchResult.statusCode,
        redirected: fetchResult.redirected,
      },
      issues,
      warnings,
      passed,
    };
  }

  // ─── Keywords & Content Analysis ───────────────────────────────
  static analyzeKeywords(content, meta) {
    const issues = [];
    const warnings = [];
    const passed = [];
    let score = 100;

    // Word count
    if (content.wordCount < 300) {
      issues.push({ message: `Thin content: only ${content.wordCount} words. Aim for 300+ words minimum.`, impact: 'critical' });
      score -= 25;
    } else if (content.wordCount < 600) {
      warnings.push({ message: `Content could be longer (${content.wordCount} words). 600-2000 words tends to rank better.`, impact: 'moderate' });
      score -= 10;
    } else if (content.wordCount >= 600) {
      passed.push(`Good content length: ${content.wordCount} words`);
    }

    // Keyword density check
    if (content.topKeywords.length > 0) {
      const topDensity = parseFloat(content.topKeywords[0].density);
      if (topDensity > 5) {
        warnings.push({ message: `Possible keyword stuffing: "${content.topKeywords[0].word}" appears at ${topDensity}% density.`, impact: 'moderate' });
        score -= 10;
      } else {
        passed.push('No keyword stuffing detected');
      }
    }

    // Check if top keywords appear in title/description
    if (content.topKeywords.length > 0 && meta.title) {
      const titleLower = meta.title.toLowerCase();
      const topKeyword = content.topKeywords[0].word;
      if (titleLower.includes(topKeyword)) {
        passed.push(`Primary keyword "${topKeyword}" found in title`);
      } else {
        warnings.push({ message: `Primary content keyword "${topKeyword}" not found in page title.`, impact: 'moderate' });
        score -= 5;
      }
    }

    if (content.topKeywords.length > 0 && meta.metaDescription) {
      const descLower = meta.metaDescription.toLowerCase();
      const topKeyword = content.topKeywords[0].word;
      if (descLower.includes(topKeyword)) {
        passed.push(`Primary keyword "${topKeyword}" found in meta description`);
      } else {
        warnings.push({ message: `Primary content keyword "${topKeyword}" not found in meta description.`, impact: 'low' });
        score -= 3;
      }
    }

    // Paragraph count
    if (content.paragraphCount < 2) {
      warnings.push({ message: 'Very few paragraphs. Break content into more readable sections.', impact: 'low' });
      score -= 5;
    }

    return {
      score: Math.max(0, score),
      data: {
        wordCount: content.wordCount,
        characterCount: content.characterCount,
        paragraphCount: content.paragraphCount,
        readingTime: content.readingTime,
        topKeywords: content.topKeywords,
      },
      issues,
      warnings,
      passed,
    };
  }

  // ─── Links Analysis ────────────────────────────────────────────
  static analyzeLinks(links) {
    const issues = [];
    const warnings = [];
    const passed = [];
    let score = 100;

    const { internal, external, broken } = links;

    // Internal links
    if (internal.length === 0) {
      issues.push({ message: 'No internal links found. Internal linking is crucial for SEO.', impact: 'critical' });
      score -= 20;
    } else if (internal.length < 3) {
      warnings.push({ message: `Only ${internal.length} internal link(s). Add more to improve site navigation.`, impact: 'moderate' });
      score -= 10;
    } else {
      passed.push(`Good internal linking: ${internal.length} internal links`);
    }

    // External links
    if (external.length > 0) {
      passed.push(`${external.length} external link(s) found`);
    } else {
      warnings.push({ message: 'No external links found. Linking to authoritative sources can improve credibility.', impact: 'low' });
      score -= 3;
    }

    // Broken links
    if (broken.length > 0) {
      issues.push({ message: `${broken.length} potentially broken link(s) detected`, impact: 'moderate' });
      score -= broken.length * 3;
    } else {
      passed.push('No broken links detected');
    }

    // Nofollow links
    const nofollowInternal = internal.filter((l) => l.nofollow);
    if (nofollowInternal.length > 0) {
      warnings.push({ message: `${nofollowInternal.length} internal link(s) have nofollow attribute`, impact: 'low' });
      score -= 3;
    }

    // Empty anchor text
    const emptyAnchors = [...internal, ...external].filter(
      (l) => l.text === '[No anchor text]'
    );
    if (emptyAnchors.length > 0) {
      warnings.push({ message: `${emptyAnchors.length} link(s) have empty anchor text`, impact: 'moderate' });
      score -= 5;
    }

    return {
      score: Math.max(0, score),
      data: {
        internalCount: internal.length,
        externalCount: external.length,
        brokenCount: broken.length,
        internal: internal.slice(0, 20),
        external: external.slice(0, 20),
        broken,
      },
      issues,
      warnings,
      passed,
    };
  }

  // ─── Images Analysis ───────────────────────────────────────────
  static analyzeImages(images) {
    const issues = [];
    const warnings = [];
    const passed = [];
    let score = 100;

    if (images.length === 0) {
      warnings.push({ message: 'No images found. Visual content can improve engagement.', impact: 'low' });
      return { score: Math.max(0, score - 5), data: { total: 0 }, issues, warnings, passed };
    }

    // Alt text
    const missingAlt = images.filter((img) => !img.hasAlt);
    const emptyAlt = images.filter((img) => img.hasAlt && img.altEmpty);

    if (missingAlt.length > 0) {
      issues.push({ message: `${missingAlt.length} image(s) missing alt attribute`, impact: 'critical' });
      score -= Math.min(25, missingAlt.length * 5);
    } else {
      passed.push('All images have alt attributes');
    }

    if (emptyAlt.length > 0) {
      warnings.push({ message: `${emptyAlt.length} image(s) have empty alt text`, impact: 'moderate' });
      score -= Math.min(10, emptyAlt.length * 2);
    }

    // Dimensions
    const noDimensions = images.filter((img) => !img.hasDimensions);
    if (noDimensions.length > images.length / 2) {
      warnings.push({ message: `${noDimensions.length} image(s) missing width/height attributes. This causes layout shift.`, impact: 'moderate' });
      score -= 5;
    }

    // Lazy loading
    const lazyLoaded = images.filter((img) => img.lazyLoaded);
    if (lazyLoaded.length > 0) {
      passed.push(`${lazyLoaded.length} image(s) use lazy loading`);
    } else if (images.length > 3) {
      warnings.push({ message: 'No images use lazy loading. Consider adding loading="lazy" for below-the-fold images.', impact: 'low' });
      score -= 3;
    }

    return {
      score: Math.max(0, score),
      data: {
        total: images.length,
        missingAlt: missingAlt.length,
        emptyAlt: emptyAlt.length,
        noDimensions: noDimensions.length,
        lazyLoaded: lazyLoaded.length,
      },
      issues,
      warnings,
      passed,
    };
  }

  // ─── Mobile Friendliness ──────────────────────────────────────
  static analyzeMobile(fetchResult) {
    const issues = [];
    const warnings = [];
    const passed = [];
    let score = 100;

    const mobileData = fetchResult.mobileData || {};
    const viewportMeta = fetchResult.viewportMeta;

    // Viewport meta tag
    if (viewportMeta) {
      passed.push('Viewport meta tag is set');
      if (viewportMeta.includes('width=device-width')) {
        passed.push('Viewport uses device-width');
      } else {
        warnings.push({ message: 'Viewport meta tag does not include width=device-width', impact: 'moderate' });
        score -= 10;
      }
    } else if (mobileData.hasViewportMeta === false) {
      issues.push({ message: 'Missing viewport meta tag. Page will not render properly on mobile.', impact: 'critical' });
      score -= 25;
    }

    // Horizontal scroll
    if (mobileData.hasHorizontalScroll) {
      issues.push({ message: 'Page has horizontal scrolling. Content overflows the viewport.', impact: 'critical' });
      score -= 20;
    } else if (mobileData.hasHorizontalScroll === false) {
      passed.push('No horizontal scrolling detected');
    }

    // Font sizes
    if (mobileData.fontSizes && mobileData.fontSizes.length > 0) {
      const smallFonts = mobileData.fontSizes.filter((s) => s < 12);
      if (smallFonts.length > mobileData.fontSizes.length * 0.3) {
        warnings.push({ message: 'Many text elements use font sizes smaller than 12px', impact: 'moderate' });
        score -= 10;
      } else {
        passed.push('Font sizes are generally readable');
      }
    }

    // Tap targets
    if (mobileData.tapTargets && mobileData.tapTargets.length > 0) {
      const smallTargets = mobileData.tapTargets.filter(
        (t) => t.width < 44 || t.height < 44
      );
      if (smallTargets.length > mobileData.tapTargets.length * 0.3) {
        warnings.push({ message: `${smallTargets.length} tap targets are too small (< 44x44px)`, impact: 'moderate' });
        score -= 10;
      } else {
        passed.push('Tap targets are appropriately sized');
      }
    }

    return {
      score: Math.max(0, score),
      data: {
        hasViewport: !!viewportMeta || mobileData.hasViewportMeta,
        viewportContent: viewportMeta || '',
        hasHorizontalScroll: mobileData.hasHorizontalScroll || false,
      },
      issues,
      warnings,
      passed,
    };
  }

  // ─── Accessibility Analysis ────────────────────────────────────
  static analyzeAccessibility(parsedData, fetchResult) {
    const issues = [];
    const warnings = [];
    const passed = [];
    let score = 100;

    // Language attribute
    if (parsedData.meta.language) {
      passed.push('HTML lang attribute present');
    } else {
      issues.push({ message: 'Missing HTML lang attribute for screen readers', impact: 'critical' });
      score -= 15;
    }

    // Images alt text
    const imgsMissingAlt = parsedData.images.filter((img) => !img.hasAlt);
    if (imgsMissingAlt.length > 0) {
      issues.push({ message: `${imgsMissingAlt.length} image(s) missing alt text for screen readers`, impact: 'critical' });
      score -= Math.min(20, imgsMissingAlt.length * 4);
    } else if (parsedData.images.length > 0) {
      passed.push('All images have alt attributes');
    }

    // Heading structure
    if (parsedData.headings.h1.length === 1) {
      passed.push('Proper H1 usage for accessibility');
    } else {
      score -= 5;
    }

    // Document structure
    if (parsedData.technical.hasDoctype) {
      passed.push('DOCTYPE declaration present');
    } else {
      warnings.push({ message: 'Missing DOCTYPE declaration', impact: 'moderate' });
      score -= 5;
    }

    if (parsedData.technical.hasCharset) {
      passed.push('Character encoding specified');
    } else {
      warnings.push({ message: 'Character encoding not specified', impact: 'moderate' });
      score -= 5;
    }

    // Form elements (basic check)
    if (parsedData.technical.formsCount > 0) {
      passed.push(`${parsedData.technical.formsCount} form(s) detected — ensure labels are provided`);
    }

    return {
      score: Math.max(0, score),
      data: {
        hasLang: !!parsedData.meta.language,
        hasDoctype: parsedData.technical.hasDoctype,
        hasCharset: parsedData.technical.hasCharset,
        imgsMissingAlt: imgsMissingAlt.length,
      },
      issues,
      warnings,
      passed,
    };
  }

  // ─── Technical SEO ─────────────────────────────────────────────
  static analyzeTechnical(technical, structuredData) {
    const issues = [];
    const warnings = [];
    const passed = [];
    let score = 100;

    // SSL
    if (technical.hasSSL) {
      passed.push('SSL/HTTPS is enabled');
    } else {
      issues.push({ message: 'Site is not using HTTPS', impact: 'critical' });
      score -= 20;
    }

    // Structured Data
    if (structuredData.hasSchema) {
      passed.push(`Structured data found: ${structuredData.schemaTypes.join(', ')}`);
    } else {
      warnings.push({ message: 'No structured data (Schema.org) found. Adding schema markup can improve rich snippets.', impact: 'moderate' });
      score -= 10;
    }

    // Inline styles
    if (technical.inlineStylesCount > 10) {
      warnings.push({ message: `${technical.inlineStylesCount} elements with inline styles. Consider using CSS classes.`, impact: 'low' });
      score -= 3;
    }

    // iframes
    if (technical.iframesCount > 3) {
      warnings.push({ message: `${technical.iframesCount} iframes detected. Too many iframes can slow down the page.`, impact: 'moderate' });
      score -= 5;
    }

    return {
      score: Math.max(0, score),
      data: technical,
      structuredData: structuredData,
      issues,
      warnings,
      passed,
    };
  }

  // ─── Overall Score ─────────────────────────────────────────────
  static calculateOverallScore(results) {
    const weights = {
      meta: 0.20,
      headings: 0.10,
      performance: 0.20,
      keywords: 0.15,
      links: 0.10,
      images: 0.05,
      mobile: 0.10,
      accessibility: 0.05,
      technical: 0.05,
    };

    let weightedSum = 0;
    let totalWeight = 0;

    for (const [key, weight] of Object.entries(weights)) {
      if (results[key] && typeof results[key].score === 'number') {
        weightedSum += results[key].score * weight;
        totalWeight += weight;
      }
    }

    return Math.round(totalWeight > 0 ? weightedSum / totalWeight : 0);
  }

  /**
   * Check robots.txt and sitemap
   */
  static async checkRobotsAndSitemap(url) {
    const results = { robotsTxt: null, sitemap: null };
    const baseUrl = new URL(url);

    // Check robots.txt
    try {
      const robotsUrl = `${baseUrl.protocol}//${baseUrl.hostname}/robots.txt`;
      const resp = await axios.get(robotsUrl, { timeout: 5000 });
      if (resp.status === 200 && resp.data) {
        results.robotsTxt = {
          exists: true,
          content: resp.data.substring(0, 2000),
          hasSitemap: resp.data.toLowerCase().includes('sitemap:'),
        };
      }
    } catch {
      results.robotsTxt = { exists: false };
    }

    // Check sitemap.xml
    try {
      const sitemapUrl = `${baseUrl.protocol}//${baseUrl.hostname}/sitemap.xml`;
      const resp = await axios.get(sitemapUrl, { timeout: 5000 });
      if (resp.status === 200) {
        results.sitemap = { exists: true };
      }
    } catch {
      results.sitemap = { exists: false };
    }

    return results;
  }
}

module.exports = AnalyzerService;
