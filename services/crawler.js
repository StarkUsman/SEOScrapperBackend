const { URL } = require('url');
const ScraperService = require('./scraper');
const AnalyzerService = require('./analyzer');

class CrawlerService {
  constructor() {
    this.visited = new Set();
    this.queue = [];
    this.results = [];
    this.maxPages = parseInt(process.env.MAX_CRAWL_PAGES) || 20;
  }

  /**
   * Crawl a website starting from the given URL
   */
  async crawl(startUrl, maxPages = null) {
    const limit = maxPages || this.maxPages;
    this.visited.clear();
    this.queue = [startUrl];
    this.results = [];

    const baseHost = new URL(startUrl).hostname;

    while (this.queue.length > 0 && this.visited.size < limit) {
      const url = this.queue.shift();

      if (this.visited.has(url)) continue;
      this.visited.add(url);

      console.log(`Crawling (${this.visited.size}/${limit}): ${url}`);

      try {
        // Fetch page
        const fetchResult = await ScraperService.fetchWithAxios(url);

        // Parse HTML
        const parsedData = ScraperService.parseHTML(fetchResult.html, url);

        // Analyze
        const analysis = AnalyzerService.analyze(parsedData, fetchResult);

        // Check robots.txt and sitemap (only for first page)
        if (this.visited.size === 1) {
          const robotsSitemap =
            await AnalyzerService.checkRobotsAndSitemap(url);
          analysis.technical.data.hasRobotsTxt =
            robotsSitemap.robotsTxt?.exists || false;
          analysis.technical.data.hasSitemap =
            robotsSitemap.sitemap?.exists || false;
        }

        this.results.push({
          url,
          statusCode: fetchResult.statusCode,
          results: analysis,
          error: null,
        });

        // Add internal links to queue
        if (parsedData.links.internal) {
          parsedData.links.internal.forEach((link) => {
            try {
              const linkUrl = new URL(link.url);
              // Only follow same-host links
              if (
                linkUrl.hostname === baseHost &&
                !this.visited.has(link.url) &&
                !this.queue.includes(link.url)
              ) {
                // Skip non-HTML resources
                const ext = linkUrl.pathname.split('.').pop().toLowerCase();
                const skipExts = [
                  'pdf', 'jpg', 'jpeg', 'png', 'gif', 'svg', 'css',
                  'js', 'ico', 'woff', 'woff2', 'ttf', 'eot', 'mp4',
                  'mp3', 'zip', 'rar', 'xml',
                ];
                if (!skipExts.includes(ext)) {
                  this.queue.push(link.url);
                }
              }
            } catch {}
          });
        }
      } catch (error) {
        console.error(`Error crawling ${url}:`, error.message);
        this.results.push({
          url,
          statusCode: null,
          results: null,
          error: error.message,
        });
      }
    }

    return {
      pagesAnalyzed: this.results.length,
      totalPagesFound: this.visited.size + this.queue.length,
      results: this.results,
      summary: this.generateSummary(),
    };
  }

  /**
   * Generate a summary of crawl results
   */
  generateSummary() {
    const successful = this.results.filter((r) => r.results);
    const failed = this.results.filter((r) => r.error);

    if (successful.length === 0) {
      return { averageScore: 0, commonIssues: [], pagesWithErrors: failed.length };
    }

    // Average scores
    const scores = successful.map((r) => r.results.overallScore);
    const avgScore = Math.round(
      scores.reduce((a, b) => a + b, 0) / scores.length
    );

    // Category averages
    const categories = [
      'meta', 'headings', 'performance', 'keywords',
      'links', 'images', 'mobile', 'accessibility', 'technical',
    ];
    const categoryAvgs = {};
    categories.forEach((cat) => {
      const catScores = successful
        .filter((r) => r.results[cat])
        .map((r) => r.results[cat].score);
      if (catScores.length > 0) {
        categoryAvgs[cat] = Math.round(
          catScores.reduce((a, b) => a + b, 0) / catScores.length
        );
      }
    });

    // Common issues
    const issueCounts = {};
    successful.forEach((page) => {
      categories.forEach((cat) => {
        if (page.results[cat]?.issues) {
          page.results[cat].issues.forEach((issue) => {
            const key = `[${cat}] ${issue.message}`;
            issueCounts[key] = (issueCounts[key] || 0) + 1;
          });
        }
      });
    });

    const commonIssues = Object.entries(issueCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([message, count]) => ({ message, affectedPages: count }));

    // Pages with lowest scores
    const worstPages = successful
      .sort((a, b) => a.results.overallScore - b.results.overallScore)
      .slice(0, 5)
      .map((p) => ({ url: p.url, score: p.results.overallScore }));

    return {
      averageScore: avgScore,
      categoryAverages: categoryAvgs,
      commonIssues,
      worstPages,
      pagesWithErrors: failed.length,
      totalIssues: Object.values(issueCounts).reduce((a, b) => a + b, 0),
    };
  }
}

module.exports = CrawlerService;
