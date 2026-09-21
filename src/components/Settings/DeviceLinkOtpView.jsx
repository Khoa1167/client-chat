import Button from '../common/Button';

export default function DeviceLinkOtpView({ busy, onCreate, onEnter, onBack }) {
  return (
    <div className="mt-4 flex flex-col gap-2">
      <p className="text-xs text-base-content/60">Chọn vai trò của thiết bị trong luồng OTP.</p>
      <Button onClick={onCreate} disabled={busy} variant="primary" className="btn-sm rounded-full">
        Thiết bị mới — Tạo OTP
      </Button>
      <Button onClick={onEnter} disabled={busy} className="btn-sm rounded-full bg-base-200">
        Thiết bị cũ — Nhập OTP
      </Button>
      <Button onClick={onBack} disabled={busy} className="btn-sm rounded-full">
        Quay lại chọn phương thức
      </Button>
    </div>
  );
}
