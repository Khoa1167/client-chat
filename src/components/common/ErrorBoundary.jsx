import { Component } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { AlertCircleIcon } from '@hugeicons/core-free-icons';

// Bọc quanh app root — chặn lỗi render không bắt được, tránh màn hình trắng toàn app.
// Bắt buộc class component: getDerivedStateFromError/componentDidCatch chưa có hook tương đương.
export default class ErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary] Lỗi không bắt được:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
    <div className="flex flex-col items-center justify-center h-[100dvh] bg-base-100 text-base-content p-8 text-center gap-4">
          <HugeiconsIcon icon={AlertCircleIcon} size={56} strokeWidth={1.8} className="opacity-30" />
          <p className="text-lg font-bold">Đã có lỗi xảy ra</p>
          <p className="text-sm opacity-70">Vui lòng tải lại trang. Nếu lỗi tiếp diễn, hãy báo cho quản trị viên.</p>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>Tải lại trang</button>
        </div>
      );
    }
    return this.props.children;
  }
}
