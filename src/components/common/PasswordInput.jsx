// Ô nhập password kèm icon xem/ẩn, nhận mọi prop như <input> thường.
import { useState } from 'react';
import { Eye, EyeOff } from '../icons';

export default function PasswordInput({ className = '', ...props }) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative w-full">
      <input type={visible ? 'text' : 'password'} className={`${className} pr-9`} {...props} />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setVisible(v => !v)}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-base-content/40 hover:text-base-content/70"
      >
        {visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
      </button>
    </div>
  );
}
