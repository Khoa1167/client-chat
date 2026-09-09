import { useRef, useState } from 'react';

// Cuộn khung tin nhắn: nút "về cuối" chỉ hiện khi đang cuộn lên xa (>300px), tự ẩn khi gần đáy.
export default function useChatScroll() {
  const bottomRef = useRef(null);
  const containerRef = useRef(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const isFar = scrollHeight - scrollTop - clientHeight > 300;
    setShowScrollBottom(isFar);
  };

  return { bottomRef, containerRef, showScrollBottom, scrollToBottom, handleScroll };
}
