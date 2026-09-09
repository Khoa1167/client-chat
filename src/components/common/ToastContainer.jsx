import { useState, useEffect } from 'react';
import Toast from './Toast';
import { subscribeToast } from './toastStore';

// Mount đúng 1 lần ở App.jsx — z cao hơn mọi Modal (kể cả modal lồng trong modal, z-[60] cao
// nhất hiện có) để toast luôn nổi trên cùng bất kể được gọi từ đâu trong cây component.
export default function ToastContainer() {
  const [{ text, type }, setState] = useState({ text: '', type: 'error' });

  useEffect(() => subscribeToast(setState), []);

  return <Toast message={text} type={type} z="z-[110]" />;
}
