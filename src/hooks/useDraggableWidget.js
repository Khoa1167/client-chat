import { useEffect, useRef, useState } from 'react';

// widthLimit/heightLimit đổi theo loại hiển thị (video/audio) — bong bóng vuông vs tròn khác kích thước.
export default function useDraggableWidget({ isMinimized, widthLimit, heightLimit }) {
  const [position, setPosition] = useState({ x: window.innerWidth - 160, y: window.innerHeight - 240 });
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const elementStartRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (isMinimized) {
      const defaultX = window.innerWidth - widthLimit;
      const defaultY = window.innerHeight - heightLimit;
      const timer = setTimeout(() => setPosition({ x: defaultX, y: defaultY }), 0);
      return () => clearTimeout(timer);
    }
  }, [isMinimized, widthLimit, heightLimit]);

  useEffect(() => {
    const handleResize = () => {
      setPosition(prev => ({
        x: Math.max(10, Math.min(prev.x, window.innerWidth - widthLimit)),
        y: Math.max(10, Math.min(prev.y, window.innerHeight - heightLimit)),
      }));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [widthLimit, heightLimit]);

  const clamp = (deltaX, deltaY) => ({
    x: Math.max(10, Math.min(window.innerWidth - widthLimit, elementStartRef.current.x + deltaX)),
    y: Math.max(10, Math.min(window.innerHeight - heightLimit, elementStartRef.current.y + deltaY)),
  });

  const handleMouseMove = (e) => {
    if (!isDraggingRef.current) return;
    setPosition(clamp(e.clientX - dragStartRef.current.x, e.clientY - dragStartRef.current.y));
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  };

  const handleMouseDown = (e) => {
    if (e.target.closest('button')) return; // Không kéo khi click nút chức năng
    isDraggingRef.current = true;
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    elementStartRef.current = { x: position.x, y: position.y };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleTouchMove = (e) => {
    if (!isDraggingRef.current) return;
    e.preventDefault(); // Chặn cuộn trang khi drag
    const touch = e.touches[0];
    setPosition(clamp(touch.clientX - dragStartRef.current.x, touch.clientY - dragStartRef.current.y));
  };

  const handleTouchEnd = () => {
    isDraggingRef.current = false;
    document.removeEventListener('touchmove', handleTouchMove);
    document.removeEventListener('touchend', handleTouchEnd);
  };

  const handleTouchStart = (e) => {
    if (e.target.closest('button')) return;
    const touch = e.touches[0];
    isDraggingRef.current = true;
    dragStartRef.current = { x: touch.clientX, y: touch.clientY };
    elementStartRef.current = { x: position.x, y: position.y };
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);
  };

  return { position, handleMouseDown, handleTouchStart };
}
