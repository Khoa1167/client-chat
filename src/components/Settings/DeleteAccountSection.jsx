import { useState } from 'react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import PasswordInput from '../common/PasswordInput';
import { requestAccountDeletion } from '../../api/auth.api';
import { useAuth } from '../../context/AuthContext';

export default function DeleteAccountSection() {
  const { logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleConfirm = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await requestAccountDeletion({ currentPassword: password });
      await logout();
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể xóa tài khoản');
      setLoading(false);
    }
  };

  return (
    <div className="mt-8 pt-6 border-t border-error/20">
      <h3 className="text-sm font-bold text-error mb-1">Vùng nguy hiểm</h3>
      <p className="text-xs text-base-content/60 mb-3">
        Xóa tài khoản sẽ khóa đăng nhập ngay. Dữ liệu được giữ 14 ngày để bạn có thể khôi phục qua email, sau đó bị xóa vĩnh viễn.
      </p>
      <Button type="button" onClick={() => setOpen(true)} variant="soft-error" size="sm">Xóa tài khoản</Button>

      {open && (
        <Modal onClose={loading ? undefined : () => setOpen(false)} boxClassName="max-w-sm bg-base-100 border border-base-300 shadow-2xl">
          <h3 className="text-base font-bold mb-2">Xác nhận xóa tài khoản</h3>
          <p className="text-xs text-base-content/60 mb-4">
            Nhập mật khẩu để xác nhận. Tài khoản sẽ bị khóa ngay, xóa vĩnh viễn sau 14 ngày nếu không khôi phục qua "Khôi phục tài khoản" ở trang đăng nhập.
          </p>
          <form onSubmit={handleConfirm} className="flex flex-col gap-3">
            <PasswordInput
              className="input input-bordered w-full"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Mật khẩu hiện tại"
              autoFocus
            />
            {error && <span className="text-xs text-error">{error}</span>}
            <div className="flex justify-end gap-2">
              <Button type="button" onClick={() => setOpen(false)} size="sm" disabled={loading}>Hủy</Button>
              <Button type="submit" variant="error" size="sm" disabled={loading || !password}>
                {loading ? 'Đang xử lý...' : 'Xóa tài khoản'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
