// Khung modal dùng chung, thay cặp div "modal modal-open"+"modal-box" viết tay lặp lại.
// onClose bỏ trống nếu không cho đóng bằng bấm backdrop; zIndex cho modal lồng modal (vd z-[60]).
export default function Modal({ onClose, boxClassName = 'max-w-md bg-base-100 border border-base-300 shadow-2xl', zIndex = 'z-50', children }) {
  return (
    <div className={`modal modal-open bg-black/50 backdrop-blur-sm ${zIndex}`} onClick={onClose}>
      <div className={`modal-box ${boxClassName}`} onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
