import { Capacitor } from '@capacitor/core';
import { extractOgTags } from './ogTagExtractor';

// ponytail: chỉ chạy trên Android — web bị CORS chặn, không có server proxy
const previewCache = new Map();
const MAX_HTML_SIZE = 300 * 1024; // 300KB — OG tags always in <head>

export async function fetchLinkPreview(url) {
  // Only run on native platform (Android). Web will silently fail.
  if (!Capacitor.isNativePlatform()) return null;

  // Check cache first
  if (previewCache.has(url)) {
    return previewCache.get(url);
  }

  try {
    // Validate URL
    const parsedUrl = new URL(url);
    if (!parsedUrl.protocol.startsWith('http')) return null;

    // Fetch with timeout + size limit
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; LinkPreviewBot)',
      },
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      previewCache.set(url, null);
      return null;
    }

    // Read response, respecting size limit
    let html = '';
    const reader = response.body.getReader();
    let done = false;

    while (!done) {
      const { value, done: streamDone } = await reader.read();
      if (streamDone) {
        done = true;
      } else {
        html += new TextDecoder().decode(value);
        if (html.length > MAX_HTML_SIZE) {
          done = true; // Stop reading after limit
        }
      }
    }

    const preview = extractOgTags(html, url);
    previewCache.set(url, preview);
    return preview;
  } catch {
    // Network error, timeout, abort — return null silently
    previewCache.set(url, null);
    return null;
  }
}
