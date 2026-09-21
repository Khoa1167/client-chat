export const MAX_ATTACHMENT_CACHE_BYTES = 500 * 1024 * 1024;
export const ATTACHMENT_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export const isAttachmentCacheExpired = (lastUsedAt, now) => (
  !Number.isFinite(lastUsedAt) || now - lastUsedAt > ATTACHMENT_CACHE_TTL_MS
);
