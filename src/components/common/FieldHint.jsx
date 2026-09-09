import { cloneElement, useState } from 'react';

// Bọc 1 input, hiện gợi ý định dạng qua tooltip khi hover/focus — chủ động trước khi user đoán sai.
// children phải là 1 input duy nhất; tự gắn thêm onFocus/onBlur (giữ handler gốc) để ép hiện lúc gõ.
export default function FieldHint({ hint, position = 'top', children }) {
  const [focused, setFocused] = useState(false);

  const child = cloneElement(children, {
    onFocus: (e) => { setFocused(true); children.props.onFocus?.(e); },
    onBlur: (e) => { setFocused(false); children.props.onBlur?.(e); },
  });

  return (
    <div className={`tooltip tooltip-${position} w-full ${focused ? 'tooltip-open' : ''}`} data-tip={hint}>
      {child}
    </div>
  );
}
