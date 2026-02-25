const express = require('express');
const router = express.Router();
const ScraperService = require('../services/scraper');
const AnalyzerService = require('../services/analyzer');
const aiService = require('../services/aiService');
const CrawlerService = require('../services/crawler');

/**
 * POST /api/audit
 * Single URL SEO audit
 */
router.post('/audit', async (req, res) => {
  const { url, useJavaScript = true } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  // Validate URL
  try {
    new URL(url);
  } catch {
    return res.status(400).json({ error: 'Invalid URL format' });
  }

  try {
    console.log(`\n🔍 Starting SEO audit for: ${url}`);
    const startTime = Date.now();

    // Step 1: Fetch the page
    console.log('📥 Fetching page...');
    let fetchResult;
    if (useJavaScript) {
      try {
        fetchResult = await ScraperService.fetchWithPuppeteer(url);
      } catch (puppeteerError) {
        console.log('⚠️ Puppeteer failed, falling back to axios...');
        fetchResult = await ScraperService.fetchWithAxios(url);
      }
    } else {
      fetchResult = await ScraperService.fetchWithAxios(url);
    }

    // Step 2: Parse HTML
    console.log('📄 Parsing HTML...');
    const parsedData = ScraperService.parseHTML(fetchResult.html, url);

    // Step 3: Analyze SEO
    console.log('🔬 Analyzing SEO factors...');
    const auditResults = AnalyzerService.analyze(parsedData, fetchResult);

    // Step 4: Check robots.txt and sitemap
    console.log('🤖 Checking robots.txt & sitemap...');
    const robotsSitemap = await AnalyzerService.checkRobotsAndSitemap(url);
    auditResults.technical.data.hasRobotsTxt = robotsSitemap.robotsTxt?.exists || false;
    auditResults.technical.data.hasSitemap = robotsSitemap.sitemap?.exists || false;

    if (!robotsSitemap.robotsTxt?.exists) {
      auditResults.technical.issues.push({
        message: 'No robots.txt found',
        impact: 'moderate',
      });
      auditResults.technical.score = Math.max(0, auditResults.technical.score - 10);
    }
    if (!robotsSitemap.sitemap?.exists) {
      auditResults.technical.warnings.push({
        message: 'No sitemap.xml found',
        impact: 'moderate',
      });
      auditResults.technical.score = Math.max(0, auditResults.technical.score - 5);
    }

    // Recalculate overall score
    auditResults.overallScore = AnalyzerService.calculateOverallScore(auditResults);

    // Step 5: Generate AI recommendations
    console.log('🤖 Generating AI recommendations...');
    const aiRecommendations = await aiService.generateRecommendations(auditResults, url);

    const totalTime = Date.now() - startTime;
    console.log(`✅ Audit completed in ${totalTime}ms\n`);

    res.json({
      success: true,
      url,
      finalUrl: fetchResult.finalUrl,
      auditedAt: new Date().toISOString(),
      duration: totalTime,
      results: auditResults,
      aiRecommendations,
    });
  } catch (error) {
    console.error('❌ Audit failed:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      url,
    });
  }
});

/**
 * POST /api/crawl
 * Multi-page site crawl
 */
router.post('/crawl', async (req, res) => {
  const { url, maxPages = 10 } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    new URL(url);
  } catch {
    return res.status(400).json({ error: 'Invalid URL format' });
  }

  const limit = Math.min(maxPages, parseInt(process.env.MAX_CRAWL_PAGES) || 20);

  try {
    console.log(`\n🕷️ Starting site crawl for: ${url} (max ${limit} pages)`);
    const startTime = Date.now();

    const crawler = new CrawlerService();
    const crawlResults = await crawler.crawl(url, limit);

    // Generate AI summary
    console.log('🤖 Generating AI crawl summary...');
    const aiSummary = await aiService.generateCrawlSummary(crawlResults.results);

    const totalTime = Date.now() - startTime;
    console.log(`✅ Crawl completed in ${totalTime}ms\n`);

    res.json({
      success: true,
      url,
      crawledAt: new Date().toISOString(),
      duration: totalTime,
      pagesAnalyzed: crawlResults.pagesAnalyzed,
      totalPagesFound: crawlResults.totalPagesFound,
      summary: crawlResults.summary,
      pages: crawlResults.results,
      aiSummary,
    });
  } catch (error) {
    console.error('❌ Crawl failed:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      url,
    });
  }
});

/**
 * GET /api/quick-check?url=...
 * Quick meta tags check (lightweight, no Puppeteer)
 */
router.get('/quick-check', async (req, res) => {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'URL query parameter is required' });
  }

  try {
    const fetchResult = await ScraperService.fetchWithAxios(url);
    const parsedData = ScraperService.parseHTML(fetchResult.html, url);

    res.json({
      success: true,
      url,
      meta: parsedData.meta,
      headings: {
        h1: parsedData.headings.h1,
        h2: parsedData.headings.h2,
      },
      wordCount: parsedData.content.wordCount,
      linksCount: {
        internal: parsedData.links.internal.length,
        external: parsedData.links.external.length,
      },
      imagesCount: parsedData.images.length,
      imagesWithoutAlt: parsedData.images.filter((i) => !i.hasAlt).length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;
