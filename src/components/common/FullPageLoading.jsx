import Spinner from './Spinner';

// Màn hình loading toàn trang. Không bọc text trực tiếp trong .loading daisyUI — nó mask nội dung
// con thành icon xoay tròn, chữ bên trong bị ẩn mất.
export default function FullPageLoading({ text = 'Đang tải...' }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-base-100 text-base-content/60">
      <Spinner size="lg" />
      <span className="text-sm">{text}</span>
    </div>
  );
}
