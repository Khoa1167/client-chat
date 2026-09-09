import { useState, useEffect, useRef } from 'react';

// Debounce kiểm tra 1 giá trị (username/nickname...) qua API, trả về 'checking'|'available'|
// 'taken'|'invalid'|''. `validate` (tùy chọn) kiểm tra định dạng trước, tránh lẫn 'invalid' với 'taken'.
export default function useAvailabilityCheck(value, { checkFn, validate, minLength = 2, debounceMs = 500, skipValue }) {
  const [status, setStatus] = useState('');
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  // skip/invalid derive thẳng từ prop lúc render — không cần effect+setState riêng (tránh cascading render).
  const skip = value === skipValue || value.trim().length < minLength;
  const formatInvalid = !skip && validate && !validate(value);

  useEffect(() => {
    if (skip || formatInvalid) return;

    // setState đồng bộ trước async — đúng mẫu "Fetching data" của React docs.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStatus('checking');
    const timeout = setTimeout(async () => {
      try {
        const available = await checkFn(value);
        if (isMountedRef.current) setStatus(available ? 'available' : 'taken');
      } catch {
        if (isMountedRef.current) setStatus('');
      }
    }, debounceMs);

    return () => clearTimeout(timeout);
    // checkFn/validate cố tình bỏ khỏi deps — thường là hàm inline, đưa vào sẽ reset debounce liên tục.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, minLength, debounceMs, skipValue, skip, formatInvalid]);

  if (skip) return '';
  if (formatInvalid) return 'invalid';
  return status;
}
