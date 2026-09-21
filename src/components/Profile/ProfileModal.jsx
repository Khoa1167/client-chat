import { useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Cancel01Icon, CheckmarkCircle02Icon } from '@hugeicons/core-free-icons';
import { format } from 'date-fns';
import { QrCode } from '../icons';
import Modal from '../common/Modal';
import Button from '../common/Button';
import ShareProfileModal from './ShareProfileModal';
import { useAuth } from '../../context/AuthContext';

const GENDER_LABEL = { male: 'Nam', female: 'Nữ', other: 'Khác' };

export default function ProfileModal({ onClose }) {
  const { user } = useAuth();
  const [showShareProfile, setShowShareProfile] = useState(false);

  return (
    <Modal onClose={onClose} boxClassName="p-0 max-w-md bg-base-100 border border-base-300 shadow-2xl">
      <div className="p-5 pb-4 border-b border-base-300 flex items-center justify-between">
        <h2 className="text-lg font-bold">Trang cá nhân</h2>
        <div className="flex items-center gap-2">
          <Button
            size="sm" pill className="bg-base-200 gap-1.5"
            onClick={() => setShowShareProfile(true)}
            title="Chia sẻ QR/link kết bạn"
          >
            <QrCode className="w-4 h-4" /> Chia sẻ
          </Button>
          <Button size="sm" pill className="bg-base-200 gap-1" onClick={onClose}><HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={1.8} />Đóng</Button>
        </div>
      </div>

      <div className="overflow-y-auto max-h-[70vh] p-6 hide-scrollbar flex flex-col gap-5">
        <div className="flex flex-col items-center text-center gap-2">
          <div className="relative w-full h-32 rounded-xl bg-gradient-to-r from-primary to-secondary overflow-hidden shadow-xs">
            {user.cover ? (
              <img src={user.cover} alt="cover" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-gradient-to-r from-primary to-secondary opacity-90 flex items-center justify-center text-primary-content/30 text-xs font-semibold">
                Chưa có ảnh bìa
              </div>
            )}
          </div>

          <div className="avatar -mt-12">
            <div className="w-24 rounded-full bg-primary text-primary-content font-bold text-3xl shadow-lg ring-4 ring-base-100">
              {user.avatar ? (
                <img src={user.avatar} alt="avatar" />
              ) : (
                <span className="w-full h-full flex items-center justify-center">{(user.nickname || user.username)[0].toUpperCase()}</span>
              )}
            </div>
          </div>

          <h3 className="text-xl font-bold tracking-tight mt-1">{user.nickname || user.username}</h3>

          {user.bio && (
            <p className="text-xs italic text-base-content/70 bg-base-200/80 px-3.5 py-1.5 rounded-xl border border-base-300 max-w-xs mt-1 leading-relaxed">
              "{user.bio}"
            </p>
          )}
        </div>

        <div className="bg-base-200/80 border border-base-300 rounded-xl p-4 flex flex-col gap-3">
          <h4 className="text-xs font-bold text-base-content/40 uppercase tracking-wider">Thông tin cá nhân</h4>

          <div className="flex items-center justify-between text-xs">
            <span className="text-base-content/50 font-medium">Tên tài khoản:</span>
            <span className="font-semibold">{user.username}</span>
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="text-base-content/50 font-medium">Email:</span>
            <span className="font-semibold flex items-center gap-1">
              {user.email || 'Chưa cập nhật'}
              {user.email && <span className="badge badge-success badge-outline badge-xs gap-1"><HugeiconsIcon icon={CheckmarkCircle02Icon} size={12} strokeWidth={1.8} />Đã xác minh</span>}
            </span>
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="text-base-content/50 font-medium">Số điện thoại:</span>
            <span className="font-semibold">{user.phone || 'Chưa cập nhật'}</span>
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="text-base-content/50 font-medium">Giới tính:</span>
            <span className="font-semibold">{GENDER_LABEL[user.gender] || 'Chưa cập nhật'}</span>
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="text-base-content/50 font-medium">Ngày sinh:</span>
            <span className="font-semibold">
              {user.dateOfBirth ? format(new Date(user.dateOfBirth), 'dd/MM/yyyy') : 'Chưa cập nhật'}
            </span>
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="text-base-content/50 font-medium">Tham gia từ:</span>
            <span className="font-semibold">
              {user.createdAt ? format(new Date(user.createdAt), 'dd/MM/yyyy') : 'Chưa cập nhật'}
            </span>
          </div>
        </div>
      </div>

      {showShareProfile && (
        <ShareProfileModal userId={user._id} onClose={() => setShowShareProfile(false)} />
      )}
    </Modal>
  );
}
