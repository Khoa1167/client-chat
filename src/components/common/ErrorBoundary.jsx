import { Component } from 'react';

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
        <div className="flex flex-col items-center justify-center h-screen bg-base-100 text-base-content p-8 text-center gap-4">
          <span className="text-6xl opacity-30">⚠️</span>
          <p className="text-lg font-bold">Đã có lỗi xảy ra</p>
          <p className="text-sm opacity-70">Vui lòng tải lại trang. Nếu lỗi tiếp diễn, hãy báo cho quản trị viên.</p>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>Tải lại trang</button>
        </div>
      );
    }
    return this.props.children;
  }
}
