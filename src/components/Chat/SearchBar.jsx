import { useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Search01Icon, Cancel01Icon } from '@hugeicons/core-free-icons';
import { getMessageSnippet } from '../../utils/messageSearch';
import useAutoLoadSearch from '../../hooks/chat/useAutoLoadSearch';

export default function SearchBar({ messages, hasMore, loadMore, onSelectMessage, onClose }) {
  const [query, setQuery] = useState('');
  const { results, isLoadingMore } = useAutoLoadSearch(messages, query, hasMore, loadMore);

  const handleSelectResult = (messageId) => {
    onSelectMessage?.(messageId);
    setQuery('');
  };

  return (
    <div className="flex flex-col gap-3 p-4 border-b border-base-300">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <HugeiconsIcon icon={Search01Icon} size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-base-content/50" />
          <input
            type="text"
            placeholder="Tìm tin nhắn..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="input input-sm input-bordered w-full pl-9 pr-9"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-base-content/50 hover:text-base-content"
            >
              <HugeiconsIcon icon={Cancel01Icon} size={16} />
            </button>
          )}
        </div>
        <button onClick={onClose} className="btn btn-ghost btn-sm btn-circle">
          ✕
        </button>
      </div>

      {query && (
        <div className="text-xs text-base-content/60">
          {isLoadingMore ? 'Đang tải thêm tin nhắn cũ...' : `Tìm thấy ${results.length} kết quả`}
        </div>
      )}

      {results.length > 0 && (
        <div className="max-h-64 overflow-y-auto space-y-2">
          {results.map((msg) => (
            <button
              key={msg._id}
              onClick={() => handleSelectResult(msg._id)}
              className="w-full text-left p-2 rounded-lg hover:bg-base-200 transition-colors"
            >
              <div className="text-xs font-semibold text-base-content/70">
                {msg.sender?.nickname || msg.sender?.username || 'Unknown'}
              </div>
              <div className="text-xs text-base-content/60 line-clamp-2">
                {getMessageSnippet(msg.decryptedText, query, 80)}
              </div>
              <div className="text-[10px] text-base-content/40 mt-1">
                {new Date(msg.createdAt).toLocaleString('vi-VN')}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
