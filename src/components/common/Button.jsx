// Nút dùng chung (bọc btn daisyUI) — 'ghost' có hover:bg-base-300 tránh lặp lỗi hover trùng màu nền.
// active=true ép style primary bất kể variant, dùng cho nút điều hướng đang chọn.
// size/circle/pill mặc định KHÔNG thêm class gì (chỉ áp khi truyền vào) — nhiều nơi gọi cũ đang tự
// truyền btn-sm/btn-circle/... qua className, không được để mặc định mới đè/xung đột với chúng.
const VARIANT_CLASSES = {
  primary: 'btn-primary text-white',
  ghost: 'btn-ghost text-base-content/60 hover:text-base-content',
  'ghost-error': 'btn-ghost text-error/70 hover:text-error',
  error: 'bg-error text-white hover:bg-error/90',
  success: 'btn-success text-white',
  'soft-error': 'bg-error/10 hover:bg-error/20 text-error border-error/20',
};

const SIZE_CLASSES = { xs: 'btn-xs', sm: 'btn-sm', md: 'btn-md', lg: 'btn-lg' };

export default function Button({
  variant = 'ghost', active = false, size, circle = false, pill = false,
  className = '', children, ...props
}) {
  const variantClass = active ? VARIANT_CLASSES.primary : (VARIANT_CLASSES[variant] || VARIANT_CLASSES.ghost);
  const sizeClass = size ? (SIZE_CLASSES[size] || '') : '';
  return (
    <button
      type="button"
      className={`btn ${sizeClass} ${variantClass} ${circle ? 'btn-circle' : ''} ${pill ? 'rounded-full' : ''} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
