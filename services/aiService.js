const { GoogleGenerativeAI } = require('@google/generative-ai');
const Anthropic = require('@anthropic-ai/sdk');

class AIService {
  constructor() {
    this.useClaude = process.env.USE_CLAUDE === 'true';

    if (this.useClaude) {
      const claudeKey = process.env.CLAUDE_API_KEY;
      if (!claudeKey || claudeKey === 'your_claude_api_key_here') {
        console.warn('⚠️  USE_CLAUDE is true but CLAUDE_API_KEY is not set — will fall back to rule-based recommendations');
      }
      this.claude = new Anthropic({ apiKey: claudeKey });
      this.providerName = 'Claude';
      console.log('🤖 AI Provider: Anthropic Claude');
    } else {
      const geminiKey = process.env.GEMINI_API_KEY;
      this.genAI = new GoogleGenerativeAI(geminiKey);
      this.geminiModel = this.genAI.getGenerativeModel({ model: 'gemini-1.0-pro' });
      this.providerName = 'Gemini';
      console.log('🤖 AI Provider: Google Gemini');
    }
  }

  /**
   * Send a prompt to whichever AI provider is active
   */
  async _callAI(prompt) {
    if (this.useClaude) {
      const message = await this.claude.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      });
      // Claude returns content as an array of blocks
      return message.content
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('');
    } else {
      const result = await this.geminiModel.generateContent(prompt);
      return result.response.text();
    }
  }

  /**
   * Generate AI-powered SEO recommendations based on audit results
   */
  async generateRecommendations(auditResults, url) {
    const prompt = this.buildPrompt(auditResults, url);

    try {
      const text = await this._callAI(prompt);

      return {
        success: true,
        recommendations: text,
        provider: this.providerName,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error(`${this.providerName} AI Error:`, error.message);
      return {
        success: false,
        recommendations: this.getFallbackRecommendations(auditResults),
        error: error.message,
        provider: this.providerName,
        timestamp: new Date().toISOString(),
      };
    }
  }

  buildPrompt(auditResults, url) {
    // Collect all issues and warnings
    const allIssues = [];
    const allWarnings = [];
    const allPassed = [];
    const scores = {};

    const categories = [
      'meta', 'headings', 'performance', 'keywords',
      'links', 'images', 'mobile', 'accessibility', 'technical',
    ];

    categories.forEach((cat) => {
      if (auditResults[cat]) {
        scores[cat] = auditResults[cat].score;
        if (auditResults[cat].issues) {
          auditResults[cat].issues.forEach((i) =>
            allIssues.push(`[${cat.toUpperCase()}] ${i.message} (Impact: ${i.impact})`)
          );
        }
        if (auditResults[cat].warnings) {
          auditResults[cat].warnings.forEach((w) =>
            allWarnings.push(`[${cat.toUpperCase()}] ${w.message} (Impact: ${w.impact})`)
          );
        }
        if (auditResults[cat].passed) {
          auditResults[cat].passed.forEach((p) =>
            allPassed.push(`[${cat.toUpperCase()}] ${p}`)
          );
        }
      }
    });

    return `You are an expert SEO consultant. Analyze the following SEO audit results for the URL: ${url}

OVERALL SCORE: ${auditResults.overallScore}/100

CATEGORY SCORES:
${Object.entries(scores).map(([k, v]) => `- ${k}: ${v}/100`).join('\n')}

CRITICAL ISSUES:
${allIssues.length > 0 ? allIssues.join('\n') : 'None found'}

WARNINGS:
${allWarnings.length > 0 ? allWarnings.join('\n') : 'None found'}

PASSED CHECKS:
${allPassed.join('\n')}

CONTENT DATA:
- Word Count: ${auditResults.keywords?.data?.wordCount || 'N/A'}
- Top Keywords: ${auditResults.keywords?.data?.topKeywords?.slice(0, 5).map((k) => `${k.word} (${k.density}%)`).join(', ') || 'N/A'}

Based on this audit data, provide a comprehensive SEO improvement plan. Format your response as follows:

## 🔴 Critical Fixes (Do These First)
List the most impactful issues that need immediate attention with specific, actionable steps.

## 🟡 Important Improvements
List moderate-priority improvements with concrete suggestions.

## 🟢 Quick Wins
List easy-to-implement improvements that can boost SEO.

## 📝 Content Strategy Recommendations
Provide specific content improvement suggestions based on the keyword data and content analysis.

## 🔧 Technical SEO Recommendations
Provide technical improvements for better crawlability and indexing.

## 📊 Competitor Edge Tips
Provide 3 advanced tips that could give this page a competitive advantage.

Keep recommendations specific, actionable, and prioritized. Include code snippets where helpful (e.g., meta tags, schema markup). Limit your response to the most impactful recommendations.`;
  }

  /**
   * Fallback recommendations when AI is unavailable
   */
  getFallbackRecommendations(auditResults) {
    const recommendations = [];

    const categories = [
      'meta', 'headings', 'performance', 'keywords',
      'links', 'images', 'mobile', 'accessibility', 'technical',
    ];

    categories.forEach((cat) => {
      if (auditResults[cat]) {
        if (auditResults[cat].issues) {
          auditResults[cat].issues.forEach((issue) => {
            recommendations.push(`**[${cat.toUpperCase()} - ISSUE]** ${issue.message}`);
          });
        }
        if (auditResults[cat].warnings) {
          auditResults[cat].warnings.forEach((warning) => {
            recommendations.push(`*[${cat.toUpperCase()} - WARNING]* ${warning.message}`);
          });
        }
      }
    });

    if (recommendations.length === 0) {
      return '## Great Job! 🎉\nYour page passed all major SEO checks. Continue monitoring and optimizing regularly.';
    }

    return `## SEO Issues Found\n\n${recommendations.join('\n\n')}\n\n*Note: AI-powered recommendations are unavailable. Please check your ${this.providerName} API key configuration.*`;
  }

  /**
   * Generate crawl summary with AI
   */
  async generateCrawlSummary(crawlResults) {
    const prompt = `You are an expert SEO consultant. Analyze the following multi-page site crawl results and provide a site-wide SEO summary.

PAGES CRAWLED: ${crawlResults.length}

PAGE SCORES:
${crawlResults.map((p) => `- ${p.url}: Overall ${p.results?.overallScore || 'N/A'}/100`).join('\n')}

COMMON ISSUES ACROSS PAGES:
${this.findCommonIssues(crawlResults).join('\n')}

Provide a brief site-wide SEO summary with:
1. Overall site health assessment
2. Top 5 site-wide issues to fix first
3. Patterns noticed across pages
4. Site architecture recommendations

Keep it concise and actionable.`;

    try {
      const text = await this._callAI(prompt);
      return {
        success: true,
        summary: text,
        provider: this.providerName,
      };
    } catch (error) {
      return {
        success: false,
        summary: 'AI summary unavailable. Review individual page results for details.',
        error: error.message,
        provider: this.providerName,
      };
    }
  }

  findCommonIssues(crawlResults) {
    const issueCounts = {};
    crawlResults.forEach((page) => {
      if (!page.results) return;
      const categories = [
        'meta', 'headings', 'performance', 'keywords',
        'links', 'images', 'mobile', 'accessibility', 'technical',
      ];
      categories.forEach((cat) => {
        if (page.results[cat]?.issues) {
          page.results[cat].issues.forEach((issue) => {
            const key = issue.message;
            issueCounts[key] = (issueCounts[key] || 0) + 1;
          });
        }
      });
    });

    return Object.entries(issueCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([msg, count]) => `- (${count} pages) ${msg}`);
  }
}

module.exports = new AIService();
