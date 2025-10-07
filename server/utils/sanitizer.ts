/**
 * Sanitization Utilities using sanitize-html
 * 
 * Provides secure HTML and input sanitization to prevent XSS attacks
 */

import sanitizeHtml from 'sanitize-html';

/**
 * Sanitize input by stripping all HTML tags
 * Use this for user inputs that should not contain any HTML
 */
export const sanitizeInput = (input: string): string => {
  const options: sanitizeHtml.IOptions = {
    allowedTags: [], // Strip all HTML by default
    allowedAttributes: {},
    disallowedTagsMode: 'discard'
  };
  return sanitizeHtml(input, options);
};

/**
 * Sanitize HTML content while allowing safe tags
 * Use this for content that may contain limited HTML formatting
 */
export const sanitizeHTML = (html: string): string => {
  const options: sanitizeHtml.IOptions = {
    allowedTags: ['b', 'i', 'em', 'strong', 'a'],
    allowedAttributes: {
      'a': ['href']
    },
    allowedSchemes: ['http', 'https', 'ftp', 'mailto']
  };
  return sanitizeHtml(html, options);
};
