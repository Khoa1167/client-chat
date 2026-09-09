// Ô OTP daisyUI — thực chất 1 <input> duy nhất, <span> chỉ là khung hiển thị CSS-only qua :has(),
// không cần state mảng ký tự/ref auto-focus như OTP nhiều input truyền thống.
export default function OtpInput({ value, onChange, length = 6, className = '', ...inputProps }) {
  return (
    <label className={`otp otp-lg ${className}`}>
      {Array.from({ length }).map((_, i) => <span key={i} />)}
      <input
        type="text"
        autoComplete="one-time-code"
        inputMode="numeric"
        pattern={`[0-9]{${length}}`}
        maxLength={length}
        value={value}
        onChange={e => onChange(e.target.value.replace(/\D/g, '').slice(0, length))}
        {...inputProps}
      />
    </label>
  );
}
