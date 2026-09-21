import { useState, useEffect, useRef } from 'react';
import { searchMessages } from '../../utils/messageSearch';

const MIN_RESULTS_BEFORE_STOP = 5;
const MAX_AUTO_LOADS = 20;

// Tìm local (kiểu Signal) trên tin đã có + tự tải thêm cache cũ (loadMore chỉ đọc IndexedDB/SQLite,
// không gọi server) khi kết quả còn ít, tối đa MAX_AUTO_LOADS lần/query để tránh loop vô hạn.
export default function useAutoLoadSearch(messages, query, hasMore, loadMore) {
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const autoLoadCountRef = useRef(0);

  const results = query.trim() ? searchMessages(messages, query) : [];

  useEffect(() => {
    autoLoadCountRef.current = 0;
  }, [query]);

  useEffect(() => {
    if (!query.trim()) return;
    if (results.length >= MIN_RESULTS_BEFORE_STOP) return;
    if (!hasMore || isLoadingMore || autoLoadCountRef.current >= MAX_AUTO_LOADS) return;

    autoLoadCountRef.current += 1;
    setIsLoadingMore(true);
    Promise.resolve(loadMore?.()).finally(() => setIsLoadingMore(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, messages.length, hasMore]);

  return { results, isLoadingMore };
}
