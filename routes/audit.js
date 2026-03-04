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

  const limit = Math.min(maxPages, parseInt(process.env.MAX_CRAWL_PAGES) || 20000);

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

/**
 * POST /api/optimize-content
 * AI-powered content optimization
 */
const optimizeRouter = express.Router();

optimizeRouter.post('/optimize-content', async (req, res) => {
  const { text, keywords, tone, targetLength, contentType } = req.body;

  if (!text || text.trim().length < 10) {
    return res.status(400).json({ error: 'Please provide at least 10 characters of text to optimize' });
  }

  try {
    console.log(`\n✨ Starting content optimization (${text.length} chars)...`);
    const startTime = Date.now();

    const result = await aiService.optimizeContent(text, {
      keywords: keywords || [],
      tone: tone || 'professional',
      targetLength: targetLength || '',
      contentType: contentType || 'blog',
    });

    const totalTime = Date.now() - startTime;
    console.log(`✅ Content optimization completed in ${totalTime}ms (${result.suggestions?.length || 0} suggestions)\n`);

    res.json({
      success: result.success,
      duration: totalTime,
      originalText: text,
      suggestions: result.suggestions || [],
      metaSuggestions: result.metaSuggestions || {},
      summary: result.summary || {},
      provider: result.provider,
      timestamp: result.timestamp,
      error: result.error || undefined,
    });
  } catch (error) {
    console.error('❌ Content optimization failed:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/optimize-website
 * Website content + geo optimization
 */
optimizeRouter.post('/optimize-website', async (req, res) => {
  const { url, mode = 'content', geoOptions = {} } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    new URL(url);
  } catch {
    return res.status(400).json({ error: 'Invalid URL format' });
  }

  try {
    console.log(`\n🌐 Starting website ${mode} optimization for: ${url}`);
    const startTime = Date.now();

    // Fetch the page
    let fetchResult;
    try {
      fetchResult = await ScraperService.fetchWithPuppeteer(url);
    } catch {
      fetchResult = await ScraperService.fetchWithAxios(url);
    }

    // Parse HTML
    const parsedData = ScraperService.parseHTML(fetchResult.html, url);

    // Prepare page data for AI
    const pageData = {
      title: parsedData.meta?.title || '',
      metaDescription: parsedData.meta?.description || '',
      h1: parsedData.headings?.h1?.[0] || '',
      wordCount: parsedData.content?.wordCount || 0,
      topKeywords: parsedData.content?.topKeywords
        ? parsedData.content.topKeywords.slice(0, 10).map(k => `${k.word} (${k.density || k.count})`).join(', ')
        : '',
      content: parsedData.content?.text || '',
      headings: [
        ...(parsedData.headings?.h1 || []).map(h => `H1: ${h}`),
        ...(parsedData.headings?.h2 || []).map(h => `H2: ${h}`),
        ...(parsedData.headings?.h3 || []).map(h => `H3: ${h}`),
      ].join('\n'),
      structuredData: parsedData.structuredData
        ? JSON.stringify(parsedData.structuredData, null, 2).substring(0, 1000)
        : 'None found',
    };

    let result;
    if (mode === 'geo') {
      result = await aiService.optimizeWebsiteGeo(pageData, url, geoOptions);
    } else {
      result = await aiService.optimizeWebsiteContent(pageData, url);
    }

    const totalTime = Date.now() - startTime;
    console.log(`✅ Website ${mode} optimization completed in ${totalTime}ms\n`);

    res.json({
      success: result.success,
      url,
      mode,
      duration: totalTime,
      pageInfo: {
        title: pageData.title,
        metaDescription: pageData.metaDescription,
        h1: pageData.h1,
        wordCount: pageData.wordCount,
      },
      ...result,
    });
  } catch (error) {
    console.error(`❌ Website ${mode} optimization failed:`, error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = { auditRouter: router, optimizeRouter };
