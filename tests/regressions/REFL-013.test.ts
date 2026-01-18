// REFLECTION_ID: REFL-013
// This test is linked to: docs/skills/REFL-013-router-substring-matching-causes-false-positives.md
// Do not rename without updating the reflection's test_file field.

import { describe, it, expect } from 'vitest';

/**
 * REFL-013: Router Substring Matching Causes False Positives
 *
 * Discovery routing systems that use includes() for pattern matching cause
 * false positives when short keywords appear as substrings in unrelated queries.
 */
describe('REFL-013: Router Substring Matching Causes False Positives', () => {
  // Route definition
  interface Route {
    name: string;
    keywords: string[];
    handler: string;
  }

  // Anti-pattern: Substring matching with includes()
  function matchRouteSubstring(query: string, routes: Route[]): Route | null {
    const normalizedQuery = query.toLowerCase();
    for (const route of routes) {
      if (
        route.keywords.some((keyword) =>
          normalizedQuery.includes(keyword.toLowerCase())
        )
      ) {
        return route;
      }
    }
    return null;
  }

  // Verified fix: Word boundary matching
  function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function matchRouteWordBoundary(query: string, routes: Route[]): Route | null {
    const normalizedQuery = query.toLowerCase();
    for (const route of routes) {
      if (
        route.keywords.some((keyword) => {
          const regex = new RegExp(`\\b${escapeRegex(keyword.toLowerCase())}\\b`);
          return regex.test(normalizedQuery);
        })
      ) {
        return route;
      }
    }
    return null;
  }

  // Alternative fix: Token-based matching
  function matchRouteTokens(query: string, routes: Route[]): Route | null {
    // Split on non-word characters
    const tokens = new Set(
      query
        .toLowerCase()
        .split(/\W+/)
        .filter(Boolean)
    );

    for (const route of routes) {
      if (route.keywords.some((keyword) => tokens.has(keyword.toLowerCase()))) {
        return route;
      }
    }
    return null;
  }

  // Sample routes for testing
  const routes: Route[] = [
    { name: 'ai-tools', keywords: ['ai', 'gpt', 'llm'], handler: 'aiHandler' },
    {
      name: 'brainstorm',
      keywords: ['brainstorm', 'ideate'],
      handler: 'brainstormHandler',
    },
    {
      name: 'database',
      keywords: ['database', 'sql', 'query'],
      handler: 'dbHandler',
    },
    { name: 'detail', keywords: ['detail', 'spec'], handler: 'detailHandler' },
  ];

  describe('Anti-pattern: Substring matching causes false positives', () => {
    it('should incorrectly match "brainstorm" to ai route', () => {
      // "brainstorm" contains "ai" as a substring
      const query = 'help me brainstorm ideas';

      const result = matchRouteSubstring(query, routes);

      // PROBLEM: Routes to ai-tools because "brainstorm" contains "ai"
      expect(result?.name).toBe('ai-tools'); // Wrong route!
    });

    it('should incorrectly match "detail" to ai route', () => {
      // "detail" contains "ai" as a substring
      const query = 'show me the detail view';

      const result = matchRouteSubstring(query, routes);

      expect(result?.name).toBe('ai-tools'); // Wrong route!
    });

    it('should incorrectly match "maintain" to ai route', () => {
      const query = 'how do I maintain this code';

      const result = matchRouteSubstring(query, routes);

      expect(result?.name).toBe('ai-tools'); // Wrong route!
    });

    it('should show multiple false positive examples', () => {
      const falsePositives = [
        'brainstorm', // Contains "ai"
        'detail', // Contains "ai"
        'maintain', // Contains "ai"
        'obtain', // Contains "ai"
        'certain', // Contains "ai"
        'mountain', // Contains "ai"
        'complain', // Contains "ai"
      ];

      const matches = falsePositives.map((word) => ({
        word,
        matchedRoute: matchRouteSubstring(word, routes)?.name,
      }));

      // All incorrectly match the ai-tools route
      matches.forEach(({ matchedRoute }) => {
        expect(matchedRoute).toBe('ai-tools');
      });
    });
  });

  describe('Verified fix: Word boundary matching', () => {
    it('should correctly route "brainstorm" query', () => {
      const query = 'help me brainstorm ideas';

      const result = matchRouteWordBoundary(query, routes);

      // Correctly matches brainstorm route
      expect(result?.name).toBe('brainstorm');
    });

    it('should not match "detail" to ai route', () => {
      const query = 'show me the detail view';

      const result = matchRouteWordBoundary(query, routes);

      // "detail" should match detail route, not ai
      expect(result?.name).toBe('detail');
    });

    it('should correctly match actual "ai" keyword', () => {
      const query = 'use ai to help me code';

      const result = matchRouteWordBoundary(query, routes);

      // "ai" as a standalone word correctly matches
      expect(result?.name).toBe('ai-tools');
    });

    it('should not match words containing "ai" substring', () => {
      const noMatches = ['maintain this', 'obtain results', 'certain things'];

      noMatches.forEach((query) => {
        const result = matchRouteWordBoundary(query, routes);
        expect(result?.name).not.toBe('ai-tools');
      });
    });

    it('should handle hyphenated keywords', () => {
      // Add a route with hyphenated keyword
      const routesWithHyphen: Route[] = [
        ...routes,
        { name: 'ml-ops', keywords: ['ml-ops', 'mlops'], handler: 'mlopsHandler' },
      ];

      const query = 'setup ml-ops pipeline';
      const result = matchRouteWordBoundary(query, routesWithHyphen);

      expect(result?.name).toBe('ml-ops');
    });
  });

  describe('Alternative fix: Token-based matching', () => {
    it('should correctly tokenize and match', () => {
      const query = 'help me brainstorm ideas';

      const result = matchRouteTokens(query, routes);

      expect(result?.name).toBe('brainstorm');
    });

    it('should handle punctuation in queries', () => {
      const query = "what's the database, query syntax?";

      const result = matchRouteTokens(query, routes);

      expect(result?.name).toBe('database');
    });

    it('should not match partial tokens', () => {
      const query = 'maintaining code quality';

      const result = matchRouteTokens(query, routes);

      // "maintaining" tokenizes to "maintaining", not "ai"
      expect(result).toBeNull();
    });
  });

  describe('Keyword length validation', () => {
    const MIN_KEYWORD_LENGTH = 3;

    function validateKeywords(keywords: string[]): {
      valid: string[];
      invalid: string[];
    } {
      const valid = keywords.filter((k) => k.length >= MIN_KEYWORD_LENGTH);
      const invalid = keywords.filter((k) => k.length < MIN_KEYWORD_LENGTH);
      return { valid, invalid };
    }

    it('should identify short keywords as risky', () => {
      const keywords = ['ai', 'gpt', 'llm', 'go', 'db'];

      const { valid, invalid } = validateKeywords(keywords);

      expect(invalid).toEqual(['ai', 'go', 'db']);
      expect(valid).toEqual(['gpt', 'llm']);
    });

    it('should recommend minimum keyword length of 3', () => {
      // Short keywords that commonly cause false positives
      const problematicShortKeywords = ['ai', 'go', 'to', 'in', 'at', 'do'];

      const allTooShort = problematicShortKeywords.every(
        (k) => k.length < MIN_KEYWORD_LENGTH
      );
      expect(allTooShort).toBe(true);
    });
  });
});
