// Extract Open Graph metadata from HTML. Pure function, testable independently.
// Returns { title, description, image, siteName } or null if no usable data found.

const HTML_ENTITIES = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
};

function decodeHtmlEntities(text) {
  if (!text) return text;
  let result = text;
  Object.entries(HTML_ENTITIES).forEach(([entity, char]) => {
    result = result.replaceAll(entity, char);
  });
  // Numeric entities: &#NNN; and &#xHH;
  result = result.replace(/&#(\d+);/g, (match, code) => String.fromCharCode(parseInt(code, 10)));
  result = result.replace(/&#x([0-9a-fA-F]+);/g, (match, code) => String.fromCharCode(parseInt(code, 16)));
  return result;
}

function extractMetaContent(html, property, fallbackName = null) {
  // Try property-based meta tags (og:*, twitter:*, etc)
  let regex = new RegExp(`<meta\\s+(?:property|name)=['"]${property}['"]\\s+content=['"]([^'"]+)['"]`, 'i');
  let match = html.match(regex);
  if (match?.[1]) return decodeHtmlEntities(match[1]);

  // Try reverse attribute order
  regex = new RegExp(`<meta\\s+content=['"]([^'"]+)['"]\\s+(?:property|name)=['"]${property}['"]`, 'i');
  match = html.match(regex);
  if (match?.[1]) return decodeHtmlEntities(match[1]);

  // Fallback to name-based if provided
  if (fallbackName) {
    regex = new RegExp(`<meta\\s+name=['"]${fallbackName}['"]\\s+content=['"]([^'"]+)['"]`, 'i');
    match = html.match(regex);
    if (match?.[1]) return decodeHtmlEntities(match[1]);

    regex = new RegExp(`<meta\\s+content=['"]([^'"]+)['"]\\s+name=['"]${fallbackName}['"]`, 'i');
    match = html.match(regex);
    if (match?.[1]) return decodeHtmlEntities(match[1]);
  }

  return null;
}

export function extractOgTags(html, baseUrl) {
  if (!html || typeof html !== 'string') return null;

  let title = extractMetaContent(html, 'og:title');
  if (!title) {
    // Fallback to <title> tag
    const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
    title = titleMatch?.[1] ? decodeHtmlEntities(titleMatch[1]) : null;
  }

  const description = extractMetaContent(html, 'og:description', 'description');
  let image = extractMetaContent(html, 'og:image');

  // Resolve relative URLs for image
  if (image && baseUrl) {
    try {
      image = new URL(image, baseUrl).href;
      // Only accept http(s) scheme
      if (!image.startsWith('http://') && !image.startsWith('https://')) {
        image = null;
      }
    } catch {
      image = null;
    }
  }

  const siteName = extractMetaContent(html, 'og:site_name');

  // Return null if no meaningful data
  if (!title && !description && !image) return null;

  return {
    title: title || null,
    description: description || null,
    image: image || null,
    siteName: siteName || null,
  };
}
