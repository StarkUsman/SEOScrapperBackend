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
        model: 'claude-opus-4-20250514',
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

  /**
   * Optimize content for SEO — returns individual suggestions
   */
  async optimizeContent(text, options = {}) {
    const { keywords = [], tone = 'professional', targetLength = '', contentType = 'blog' } = options;

    const prompt = `You are an expert SEO content optimizer. Analyze the following content and provide INDIVIDUAL, SPECIFIC optimization suggestions.

ORIGINAL CONTENT:
"""
${text}
"""

${keywords.length > 0 ? `TARGET KEYWORDS: ${keywords.join(', ')}` : ''}
TONE: ${tone}
CONTENT TYPE: ${contentType}
${targetLength ? `TARGET LENGTH: ${targetLength}` : ''}

You MUST respond with ONLY a valid JSON object (no markdown, no code fences, no extra text). The JSON must follow this exact structure:

{
  "suggestions": [
    {
      "id": 1,
      "category": "keyword|readability|structure|tone|seo|grammar",
      "impact": "high|medium|low",
      "original": "exact text from the original content to replace",
      "replacement": "the optimized replacement text",
      "reason": "short explanation of why this change improves SEO or readability"
    }
  ],
  "metaSuggestions": {
    "title": "suggested meta title under 60 chars",
    "description": "suggested meta description under 160 chars",
    "h1": "suggested H1 tag"
  },
  "summary": {
    "totalSuggestions": 0,
    "estimatedSeoImprovement": "percentage estimate",
    "estimatedReadabilityImprovement": "percentage estimate"
  }
}

IMPORTANT RULES:
- The "original" field MUST be an exact substring found in the original content (case-sensitive match)
- Each suggestion should target a different part of the text
- Order suggestions by impact (high first)
- Provide 5-15 suggestions depending on content length
- Categories: "keyword" for keyword optimization, "readability" for clarity/flow, "structure" for sentence/paragraph restructuring, "tone" for voice adjustments, "seo" for technical SEO improvements, "grammar" for grammar/spelling fixes
- Keep replacements natural — no keyword stuffing
- Return ONLY the JSON object, nothing else`;

    try {
      const rawResult = await this._callAI(prompt);

      // Parse JSON from AI response — handle possible markdown code fences
      let jsonStr = rawResult.trim();
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      }
      const parsed = JSON.parse(jsonStr);

      // Validate suggestions have valid original text matches
      if (parsed.suggestions && Array.isArray(parsed.suggestions)) {
        parsed.suggestions = parsed.suggestions.filter(s =>
          s.original && s.replacement && text.includes(s.original)
        ).map((s, idx) => ({ ...s, id: idx + 1 }));
      }

      return {
        success: true,
        suggestions: parsed.suggestions || [],
        metaSuggestions: parsed.metaSuggestions || {},
        summary: parsed.summary || {},
        provider: this.providerName,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error(`Content optimization error (${this.providerName}):`, error.message);
      return {
        success: false,
        suggestions: [],
        error: error.message,
        provider: this.providerName,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Website content optimization — analyze page content and suggest improvements
   */
  async optimizeWebsiteContent(pageData, url) {
    const prompt = `You are an expert SEO content strategist. Analyze the following website page content and provide comprehensive content optimization recommendations.

URL: ${url}
TITLE: ${pageData.title || 'N/A'}
META DESCRIPTION: ${pageData.metaDescription || 'N/A'}
H1: ${pageData.h1 || 'N/A'}
WORD COUNT: ${pageData.wordCount || 'N/A'}
TOP KEYWORDS: ${pageData.topKeywords || 'N/A'}

PAGE CONTENT EXCERPT:
"""
${(pageData.content || '').substring(0, 3000)}
"""

HEADINGS STRUCTURE:
${pageData.headings || 'N/A'}

Provide a detailed content optimization plan:

## 📝 Content Quality Analysis
- Current content score (out of 100)
- Readability assessment
- Content depth & comprehensiveness
- E-E-A-T signals present

## ✨ Optimized Title & Meta
- Optimized title tag (under 60 chars)
- Optimized meta description (under 160 chars)
- Suggested OG title and description

## 📑 Heading Structure Optimization
Provide an ideal heading hierarchy (H1-H3) for this page.

## 🔑 Keyword Strategy
- Primary keyword recommendation
- Secondary keywords (5-8)
- Long-tail keyword opportunities (3-5)
- LSI/semantic keywords to include

## 📄 Content Improvements
- Specific paragraphs to rewrite or expand
- Missing content sections to add
- Content gaps compared to competitor pages
- Internal linking recommendations

## 🎯 Featured Snippet Optimization
Suggest content formatting to win featured snippets (lists, tables, Q&A).

## 📊 Content Scoring
Provide before/after estimated scores for each area.`;

    try {
      const result = await this._callAI(prompt);
      return {
        success: true,
        optimization: result,
        provider: this.providerName,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error(`Website content optimization error:`, error.message);
      return {
        success: false,
        error: error.message,
        provider: this.providerName,
      };
    }
  }

  /**
   * Website geo/local SEO optimization
   */
  async optimizeWebsiteGeo(pageData, url, geoOptions = {}) {
    const { targetLocation = '', businessType = '', targetRadius = '' } = geoOptions;

    const prompt = `You are an expert Local SEO and Geo-targeting specialist. Analyze the following website and provide comprehensive geo/local SEO optimization recommendations.

URL: ${url}
TITLE: ${pageData.title || 'N/A'}
META DESCRIPTION: ${pageData.metaDescription || 'N/A'}
${targetLocation ? `TARGET LOCATION: ${targetLocation}` : ''}
${businessType ? `BUSINESS TYPE: ${businessType}` : ''}
${targetRadius ? `TARGET RADIUS: ${targetRadius}` : ''}

PAGE CONTENT EXCERPT:
"""
${(pageData.content || '').substring(0, 2000)}
"""

EXISTING STRUCTURED DATA:
${pageData.structuredData || 'None found'}

Provide a comprehensive local/geo SEO optimization plan:

## 📍 Local SEO Score
Current local SEO readiness score (out of 100) with breakdown.

## 🏢 Google Business Profile Optimization
- Recommended GBP category
- Business description suggestion (750 chars max)
- Recommended attributes to enable
- Photo strategy recommendations
- Post strategy (frequency, content types)

## 📝 On-Page Local SEO
- Optimized title with location (under 60 chars)
- Optimized meta description with location (under 160 chars)
- NAP (Name, Address, Phone) consistency recommendations
- Location-specific content suggestions
- Local landing page structure

## 🔗 Local Link Building
- Citation sources to target (top 10)
- Local directory submissions
- Community/local partnership opportunities
- Local PR and event strategies

## 📋 Schema Markup (LocalBusiness)
Provide complete JSON-LD LocalBusiness schema markup code ready to implement.

## 🗺️ Geo-Targeting Strategy
- Service area page recommendations
- Location-specific keyword opportunities
- Geo-modified keyword variations (15+)
- Nearby location pages to create
- Hreflang recommendations (if multi-region)

## ⭐ Review Strategy
- Review acquisition recommendations
- Review response templates
- Platforms to prioritize

## 📱 Local Mobile Optimization
- Click-to-call implementation
- Map embed recommendations
- Mobile-specific local UX suggestions

Provide actionable, specific recommendations ready for implementation.`;

    try {
      const result = await this._callAI(prompt);
      return {
        success: true,
        optimization: result,
        provider: this.providerName,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error(`Website geo optimization error:`, error.message);
      return {
        success: false,
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
