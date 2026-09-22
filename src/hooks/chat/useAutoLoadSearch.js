import { useCallback, useEffect, useRef, useState } from 'react';
import { hasActiveSearchFilters, searchMessages } from '../../utils/messageSearch';

const MIN_RESULTS_BEFORE_STOP = 5;
const MAX_AUTO_LOADS = 20;

// Tìm local (kiểu Signal) trên tin đã có + tự tải thêm cache cũ (loadMore chỉ đọc IndexedDB/SQLite,
// không gọi server) khi kết quả còn ít, tối đa MAX_AUTO_LOADS lần/query để tránh loop vô hạn.
export default function useAutoLoadSearch(messages, query, filters = {}, hasMore, loadMore) {
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const autoLoadCountRef = useRef(0);
  const active = Boolean(query.trim() || hasActiveSearchFilters(filters));
  const results = active ? searchMessages(messages, query, filters) : [];
  const searchKey = [
    query.trim(), filters.senderId, filters.startDate, filters.endDate,
    filters.type, filters.hasAttachment ? '1' : '0',
  ].join('\u0000');

  const loadNextPage = useCallback(async () => {
    if (!hasMore || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      await loadMore?.();
    } finally {
      setIsLoadingMore(false);
    }
  }, [hasMore, isLoadingMore, loadMore]);

  useEffect(() => {
    autoLoadCountRef.current = 0;
  }, [searchKey]);

  useEffect(() => {
    if (!active) return;
    if (results.length >= MIN_RESULTS_BEFORE_STOP) return;
    if (!hasMore || isLoadingMore || autoLoadCountRef.current >= MAX_AUTO_LOADS) return;

    autoLoadCountRef.current += 1;
    void loadNextPage();
  }, [active, hasMore, isLoadingMore, loadNextPage, messages.length, results.length, searchKey]);

  return { results, isLoadingMore, active, loadNextPage };
}
