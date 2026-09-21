import { useState, useEffect, useCallback } from 'react';
import { getCachedMessages } from '../../crypto';
import { resolveMessageKey } from '../../crypto/resolveMessageKey';
import { filterMediaMessages, filterFileMessages, extractLinks } from '../../utils/mediaGalleryFilter';

export default function useRoomMediaGallery(room, user, active) {
  const [mediaMessages, setMediaMessages] = useState([]);
  const [fileMessages, setFileMessages] = useState([]);
  const [linkItems, setLinkItems] = useState([]);
  const [loading, setLoading] = useState(false);

  const scan = useCallback(async () => {
    if (!room || !user) return;
    setLoading(true);
    try {
      const cached = await getCachedMessages(user._id, room._id);

      const media = filterMediaMessages(cached);
      const files = filterFileMessages(cached);

      const withKeys = await Promise.all([...media, ...files].map(async (m) => {
        if (m.__key) return m;
        const key = await resolveMessageKey(room._id, m).catch(() => null);
        return { ...m, __key: key };
      }));
      const keyedById = new Map(withKeys.map(m => [m._id, m]));

      setMediaMessages(media.map(m => keyedById.get(m._id) || m));
      setFileMessages(files.map(m => keyedById.get(m._id) || m));
      setLinkItems(extractLinks(cached));
    } finally {
      setLoading(false);
    }
  }, [room, user]);

  useEffect(() => {
    if (!active) return;
    queueMicrotask(scan);
  }, [active, scan]);

  return { mediaMessages, fileMessages, linkItems, loading, refresh: scan };
}
