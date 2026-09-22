import { useId, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Search01Icon, Cancel01Icon } from '@hugeicons/core-free-icons';
import { getMessageSnippet } from '../../utils/messageSearch';
import { attachmentPointer } from '../../utils/attachmentDecrypt';
import useAutoLoadSearch from '../../hooks/chat/useAutoLoadSearch';
import DatePicker from '../common/DatePicker';

const emptyFilters = () => ({
  senderId: '',
  type: '',
  hasAttachment: false,
  dateRange: { from: '', to: '' },
});

const resultText = (message, query) => {
  const pointer = attachmentPointer(message);
  const attachmentName = typeof pointer?.name === 'string' ? pointer.name : null;
  if (message.type === 'image') return attachmentName || 'Hình ảnh';
  if (message.type === 'audio') return attachmentName || 'Tin nhắn thoại';
  if (message.type === 'file') return attachmentName || message.fileName || 'Tệp đính kèm';
  if (message.type === 'poll') {
    try {
      const question = JSON.parse(message.decryptedText)?.question;
      return typeof question === 'string' ? `Khảo sát: ${question}` : 'Khảo sát';
    } catch {
      return 'Khảo sát';
    }
  }
  return getMessageSnippet(message.decryptedText, query, 80);
};

export default function SearchBar({ messages, roomMembers = [], hasMore, loadMore, onSelectMessage, onClose }) {
  const [query, setQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState(emptyFilters);
  const filterPanelId = useId();
  const searchFilters = {
    senderId: filters.senderId,
    type: filters.type,
    hasAttachment: filters.hasAttachment,
    startDate: filters.dateRange.from,
    endDate: filters.dateRange.to,
  };
  const { results, isLoadingMore, active, loadNextPage } = useAutoLoadSearch(
    messages, query, searchFilters, hasMore, loadMore
  );
  const activeFilterCount = [
    filters.senderId,
    filters.type,
    filters.hasAttachment,
    filters.dateRange.from || filters.dateRange.to,
  ].filter(Boolean).length;

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
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-base-content/50 hover:text-base-content"
              aria-label="Xóa từ khóa tìm kiếm"
            >
              <HugeiconsIcon icon={Cancel01Icon} size={16} />
            </button>
          )}
        </div>
        <button type="button" onClick={onClose} className="btn btn-ghost btn-sm btn-circle" aria-label="Đóng tìm kiếm">
          ✕
        </button>
      </div>

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          className={`btn btn-xs ${showFilters || activeFilterCount ? 'btn-primary' : 'btn-ghost bg-base-200'}`}
          onClick={() => setShowFilters(value => !value)}
          aria-expanded={showFilters}
          aria-controls={filterPanelId}
        >
          Bộ lọc{activeFilterCount ? ` (${activeFilterCount})` : ''}
        </button>
        {activeFilterCount > 0 && (
          <button type="button" className="btn btn-ghost btn-xs" onClick={() => setFilters(emptyFilters())}>
            Xóa bộ lọc
          </button>
        )}
      </div>

      {showFilters && (
        <div id={filterPanelId} className="flex flex-col gap-3 rounded-xl bg-base-200/60 p-3">
          <div className="flex flex-col gap-1 text-xs font-semibold">
            <span>Khoảng ngày</span>
            <DatePicker
              mode="range"
              value={filters.dateRange}
              onChange={dateRange => setFilters(current => ({ ...current, dateRange }))}
              placeholder="Chọn khoảng ngày"
              ariaLabel="Chọn khoảng ngày gửi"
            />
          </div>

          <label className="flex flex-col gap-1 text-xs font-semibold">
            Người gửi
            <select
              className="select select-sm select-bordered w-full font-normal"
              value={filters.senderId}
              onChange={event => setFilters(current => ({ ...current, senderId: event.target.value }))}
            >
              <option value="">Tất cả người gửi</option>
              {roomMembers.map(member => (
                <option key={member._id} value={member._id}>
                  {member.nickname || member.username || 'Người dùng'}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs font-semibold">
            Loại tin nhắn
            <select
              className="select select-sm select-bordered w-full font-normal"
              value={filters.type}
              onChange={event => setFilters(current => ({ ...current, type: event.target.value }))}
            >
              <option value="">Tất cả loại</option>
              <option value="text">Văn bản</option>
              <option value="image">Hình ảnh</option>
              <option value="audio">Âm thanh</option>
              <option value="file">Tệp</option>
              <option value="poll">Khảo sát</option>
            </select>
          </label>

          <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
            <input
              type="checkbox"
              className="checkbox checkbox-sm"
              checked={filters.hasAttachment}
              onChange={event => setFilters(current => ({ ...current, hasAttachment: event.target.checked }))}
            />
            Có tệp đính kèm
          </label>
        </div>
      )}

      {active && (
        <div className="text-xs text-base-content/60" aria-live="polite">
          {isLoadingMore
            ? 'Đang tải thêm tin nhắn cũ...'
            : hasMore ? `${results.length} kết quả đã tải` : `Tìm thấy ${results.length} kết quả`}
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
                {resultText(msg, query)}
              </div>
              <div className="text-[10px] text-base-content/40 mt-1">
                {new Date(msg.createdAt).toLocaleString('vi-VN')}
              </div>
            </button>
          ))}
        </div>
      )}

      {active && !isLoadingMore && results.length === 0 && !hasMore && (
        <p className="text-xs text-center text-base-content/50 py-2">Không tìm thấy tin nhắn phù hợp</p>
      )}

      {active && hasMore && (
        <button type="button" className="btn btn-ghost btn-xs self-center" onClick={loadNextPage} disabled={isLoadingMore}>
          {isLoadingMore ? 'Đang tải...' : 'Tải thêm kết quả'}
        </button>
      )}
    </div>
  );
}
