import { useEffect, useState } from 'react';
import { fetchLinkPreview } from '../utils/fetchLinkPreview';

export default function useLinkPreview(url, shouldLoad) {
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!url || !shouldLoad) return;

    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const result = await fetchLinkPreview(url);
        if (!cancelled) {
          setPreview(result);
        }
      } catch (err) {
        console.error('[LinkPreview] Fetch failed:', err);
        if (!cancelled) {
          setPreview(null);
        }
      } finally {
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [url, shouldLoad]);

  return { preview, loading };
}
