// Icon loading dùng chung — map tường minh từng size (không ghép chuỗi) để Tailwind JIT quét thấy.
const SIZE_CLASSES = {
  xs: 'loading-xs',
  sm: 'loading-sm',
  md: 'loading-md',
  lg: 'loading-lg',
  xl: 'loading-xl',
};

export default function Spinner({ size = 'sm', className = '' }) {
  return <span className={`loading loading-spinner ${SIZE_CLASSES[size] || SIZE_CLASSES.sm} ${className}`}></span>;
}
