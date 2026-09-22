import { useEffect, useState } from 'react';
import { getBlockedUserIds } from '../api/friends.api';

let cachedIds = null;
let inflight = null;

function loadBlockedIds() {
  if (cachedIds) return Promise.resolve(cachedIds);
  inflight ??= getBlockedUserIds().then(ids => {
    cachedIds = new Set(ids);
    inflight = null;
    return cachedIds;
  });
  return inflight;
}

export default function useBlockedUserIds() {
  const [ids, setIds] = useState(cachedIds || new Set());

  useEffect(() => {
    loadBlockedIds().then(setIds);

    const onChange = (event) => {
      const next = new Set(cachedIds || []);
      if (event.detail.blocked) next.add(event.detail.userId);
      else next.delete(event.detail.userId);
      cachedIds = next;
      setIds(next);
    };
    window.addEventListener('user:block_changed', onChange);
    return () => window.removeEventListener('user:block_changed', onChange);
  }, []);

  return ids;
}
