import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ShieldAlert, AlertTriangle, Users2, Search, Lock, Unlock, ChevronLeft, ChevronRight } from '../components/icons';
import IconRail from '../components/Chat/IconRail';
import ProfileModal from '../components/Profile/ProfileModal';
import Modal from '../components/common/Modal';
import Button from '../components/common/Button';
import ConfirmModal from '../components/common/ConfirmModal';
import Tabs from '../components/common/Tabs';
import Spinner from '../components/common/Spinner';
import { toast } from '../components/common/toastStore';
import { listUsers, banUser, unbanUser } from '../api/admin.api';
import { getReports, resolveReport } from '../api/report.api';
import { useAuth } from '../context/AuthContext';

const REASON_LABELS = {
  spam: 'Spam / Tin nhắn rác',
  scam: 'Lừa đảo / Phishing',
  harassment: 'Quấy rối / Đe dọa',
  abuse: 'Nội dung độc hại',
  other: 'Khác',
};

const STATUS_META = {
  pending:   { label: 'Chờ xử lý',  cls: 'badge-warning' },
  reviewed:  { label: 'Đã duyệt',   cls: 'badge-success' },
  dismissed: { label: 'Đã từ chối', cls: 'badge-ghost' },
};

const VIEW_TABS = [
  { key: 'reports', label: 'Báo cáo vi phạm' },
  { key: 'users',   label: 'Người dùng' },
];

const TABS = [
  { key: 'all',       label: 'Tất cả' },
  { key: 'pending',   label: 'Chờ xử lý' },
  { key: 'reviewed',  label: 'Đã duyệt' },
  { key: 'dismissed', label: 'Đã từ chối' },
];

const UserChip = ({ user }) => (
  <div className="flex items-center gap-2 min-w-0">
    <div className="avatar">
      <div className="w-7 h-7 rounded-full">
        {user?.avatar ? (
          <img src={user.avatar} alt="avatar" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-primary text-primary-content text-xs font-bold">
            {(user?.nickname || user?.username || '?')[0].toUpperCase()}
          </div>
        )}
      </div>
    </div>
    <div className="min-w-0">
      <p className="text-xs font-bold truncate">{user?.nickname || user?.username || 'N/A'}</p>
      <p className="text-[10px] text-base-content/50 truncate">@{user?.username || 'n/a'}</p>
    </div>
  </div>
);

const StatCard = ({ label, value, icon: Icon, cls }) => (
  <div className="bg-base-100 border border-base-300 rounded-xl p-4 flex items-center gap-3">
    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${cls}`}>
      <Icon className="w-5 h-5" />
    </div>
    <div>
      <p className="text-xl font-bold leading-none">{value}</p>
      <p className="text-xs text-base-content/60 mt-1">{label}</p>
    </div>
  </div>
);

function UsersPanel() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [banTarget, setBanTarget] = useState(null);
  const [actingId, setActingId] = useState(null);
  const pageSize = 20;

  // Debounce 400ms + bỏ qua response đến muộn không còn khớp query hiện tại — cùng pattern
  // với FriendList.jsx tìm kiếm bạn bè.
  const latestQueryRef = useRef('');
  useEffect(() => {
    latestQueryRef.current = query;
    const timeout = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await listUsers({ q: query, page });
        if (latestQueryRef.current === query) {
          setUsers(data.users);
          setTotal(data.total);
        }
      } catch (err) {
        toast.error(err.response?.data?.message || 'Không thể tải danh sách người dùng');
      } finally {
        if (latestQueryRef.current === query) setLoading(false);
      }
    }, query ? 400 : 0);
    return () => clearTimeout(timeout);
  }, [query, page]);

  const handleQueryChange = (e) => {
    setQuery(e.target.value);
    setPage(1);
  };

  const handleToggleBan = async (target) => {
    setActingId(target._id);
    try {
      const data = await (target.isBanned ? unbanUser(target._id) : banUser(target._id));
      setUsers(prev => prev.map(u => (u._id === target._id ? data.user : u)));
    } catch (err) {
      toast.error(err.response?.data?.message || 'Không thể cập nhật trạng thái tài khoản');
    } finally {
      setActingId(null);
      setBanTarget(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="flex flex-col gap-5">
      <div className="join">
        <div className="join-item flex items-center px-3 bg-base-100 border border-base-300 border-r-0 rounded-l-lg">
          <Search className="w-4 h-4 text-base-content/40" />
        </div>
        <input
          type="text"
          value={query}
          onChange={handleQueryChange}
          placeholder="Tìm theo username, nickname hoặc email..."
          className="join-item input input-sm bg-base-100 border-base-300 w-80"
        />
      </div>

      <div className="bg-base-100 border border-base-300 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr className="text-xs">
                <th>Người dùng</th>
                <th>Email</th>
                <th>Vai trò</th>
                <th>Trạng thái</th>
                <th>Ngày tạo</th>
                <th className="text-right">Hành động</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={6} className="text-center py-8"><Spinner size="sm" className="text-base-content/50" /></td></tr>
              )}
              {!loading && users.length === 0 && (
                <tr><td colSpan={6} className="text-center py-8 text-sm text-base-content/50">Không tìm thấy người dùng nào</td></tr>
              )}
              {!loading && users.map(u => (
                <tr key={u._id}>
                  <td><UserChip user={u} /></td>
                  <td className="text-xs">{u.email}</td>
                  <td>
                    <span className={`badge badge-sm ${u.role === 'admin' ? 'badge-primary' : 'badge-ghost'}`}>
                      {u.role === 'admin' ? 'Admin' : 'User'}
                    </span>
                  </td>
                  <td>
                    <span className={`badge badge-sm ${u.isBanned ? 'badge-error' : 'badge-success'}`}>
                      {u.isBanned ? 'Đã khóa' : 'Hoạt động'}
                    </span>
                  </td>
                  <td className="text-xs text-base-content/50 whitespace-nowrap">
                    {format(new Date(u.createdAt), 'dd/MM/yyyy')}
                  </td>
                  <td className="text-right">
                    {u._id === currentUser?._id || u.role === 'admin' ? (
                      <p className="text-[10px] text-base-content/40">—</p>
                    ) : (
                      <Button
                        disabled={actingId === u._id}
                        onClick={() => (u.isBanned ? handleToggleBan(u) : setBanTarget(u))}
                        variant={u.isBanned ? 'ghost' : 'error'} size="xs" pill className="gap-1"
                      >
                        {u.isBanned ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                        {u.isBanned ? 'Mở khóa' : 'Khóa'}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button
            disabled={page <= 1}
            onClick={() => setPage(p => p - 1)}
            size="xs" pill className="disabled:opacity-30"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-xs text-base-content/60">Trang {page}/{totalPages}</span>
          <Button
            disabled={page >= totalPages}
            onClick={() => setPage(p => p + 1)}
            size="xs" pill className="disabled:opacity-30"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}

      {banTarget && (
        <ConfirmModal
          title={`Khóa tài khoản ${banTarget.nickname || banTarget.username}?`}
          description="Người dùng sẽ không thể đăng nhập hoặc dùng phiên hiện tại nữa. Bạn có thể mở khóa lại bất cứ lúc nào."
          confirmLabel="Khóa tài khoản"
          onConfirm={() => handleToggleBan(banTarget)}
          onCancel={() => setBanTarget(null)}
        />
      )}
    </div>
  );
}

export default function AdminPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [showProfile, setShowProfile] = useState(false);
  const [view, setView] = useState('reports');
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('all');
  const [resolvingId, setResolvingId] = useState(null);
  const [dismissTarget, setDismissTarget] = useState(null);
  const [approvedUser, setApprovedUser] = useState(null);

  useEffect(() => {
    getReports()
      .then((data) => setReports(data))
      .catch(err => toast.error(err.response?.data?.message || 'Không thể tải danh sách báo cáo'))
      .finally(() => setLoading(false));
  }, []);

  const handleResolve = async (report, status) => {
    setResolvingId(report._id);
    try {
      const data = await resolveReport(report._id, status);
      // data.report chưa populate reporter/reportedUser — chỉ merge field vừa đổi, giữ
      // nguyên object user đã populate sẵn trong state để bảng không mất avatar/tên.
      setReports(prev => prev.map(r => (
        r._id === report._id ? { ...r, status: data.report.status, expiresAt: data.report.expiresAt } : r
      )));
      if (status === 'reviewed') {
        setApprovedUser(report.reportedUser);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Không thể cập nhật báo cáo');
    } finally {
      setResolvingId(null);
      setDismissTarget(null);
    }
  };

  const counts = {
    all: reports.length,
    pending: reports.filter(r => r.status === 'pending').length,
    reviewed: reports.filter(r => r.status === 'reviewed').length,
    dismissed: reports.filter(r => r.status === 'dismissed').length,
  };

  const filteredReports = tab === 'all' ? reports : reports.filter(r => r.status === tab);

  return (
    <div className="flex h-[100dvh] w-screen overflow-hidden bg-base-200 text-base-content">
      <IconRail
        onSelectChat={() => navigate('/')}
        onSelectFriends={() => navigate('/', { state: { view: 'friends' } })}
        onOpenProfile={() => setShowProfile(true)}
      />

      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto pb-16 md:pb-0">
        <div className="flex items-center justify-between gap-3 bg-base-100 border-b border-base-300 px-4 sm:px-6 py-4">
          <div className="flex items-center gap-2 min-w-0">
            <ShieldAlert className="w-5 h-5 text-primary flex-shrink-0" />
            <h1 className="text-lg font-bold truncate">Admin Panel</h1>
          </div>
          <UserChip user={user} />
        </div>

        <div className="px-4 sm:px-6 pt-3 flex-shrink-0 overflow-x-auto hide-scrollbar">
          <Tabs active={view} onChange={setView} tabs={VIEW_TABS} />
        </div>

        {view === 'users' && (
          <div className="p-6">
            <UsersPanel />
          </div>
        )}

        {view === 'reports' && (
        <div className="p-6 flex flex-col gap-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Tổng số báo cáo" value={counts.all} icon={Users2} cls="bg-primary/10 text-primary" />
            <StatCard label="Chờ xử lý" value={counts.pending} icon={AlertTriangle} cls="bg-warning/10 text-warning" />
            <StatCard label="Đã duyệt" value={counts.reviewed} icon={ShieldAlert} cls="bg-success/10 text-success" />
            <StatCard label="Đã từ chối" value={counts.dismissed} icon={ShieldAlert} cls="bg-base-300 text-base-content/50" />
          </div>

          <Tabs
            className="w-fit"
            active={tab}
            onChange={setTab}
            tabs={TABS.map(t => ({ key: t.key, label: `${t.label} (${counts[t.key]})` }))}
          />

          <div className="bg-base-100 border border-base-300 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr className="text-xs">
                    <th>Người báo cáo</th>
                    <th>Người bị báo cáo</th>
                    <th>Lý do</th>
                    <th>Nội dung tin nhắn</th>
                    <th>Trạng thái</th>
                    <th>Thời gian</th>
                    <th className="text-right">Hành động</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr><td colSpan={7} className="text-center py-8"><Spinner size="sm" className="text-base-content/50" /></td></tr>
                  )}
                  {!loading && filteredReports.length === 0 && (
                    <tr><td colSpan={7} className="text-center py-8 text-sm text-base-content/50">Không có báo cáo nào</td></tr>
                  )}
                  {!loading && filteredReports.map(r => {
                    const meta = STATUS_META[r.status];
                    return (
                      <tr key={r._id}>
                        <td><UserChip user={r.reporter} /></td>
                        <td><UserChip user={r.reportedUser} /></td>
                        <td className="text-xs">{REASON_LABELS[r.reason] || r.reason}</td>
                        <td className="max-w-[220px]">
                          <p className="text-xs italic font-mono truncate" title={r.decryptedContent}>
                            "{r.decryptedContent || '(không có nội dung)'}"
                          </p>
                          {(r.integrityMismatch || r.suspectedBrigading) && (
                            <div className="flex gap-1 mt-1">
                              {r.integrityMismatch && (
                                <span className="badge badge-error badge-xs gap-1" title="Nội dung giải mã không khớp bản mã gốc">
                                  <AlertTriangle className="w-2.5 h-2.5" /> Sai lệch
                                </span>
                              )}
                              {r.suspectedBrigading && (
                                <span className="badge badge-warning badge-xs gap-1" title="Nghi ngờ report có tổ chức">
                                  Brigading
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                        <td><span className={`badge badge-sm ${meta.cls}`}>{meta.label}</span></td>
                        <td className="text-xs text-base-content/50 whitespace-nowrap">
                          {format(new Date(r.createdAt), 'dd/MM/yyyy HH:mm')}
                        </td>
                        <td>
                          {r.status === 'pending' ? (
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                disabled={resolvingId === r._id}
                                onClick={() => handleResolve(r, 'reviewed')}
                                variant="success" size="xs" pill
                              >
                                Duyệt
                              </Button>
                              <Button
                                disabled={resolvingId === r._id}
                                onClick={() => setDismissTarget(r)}
                                size="xs" pill
                              >
                                Từ chối
                              </Button>
                            </div>
                          ) : (
                            <p className="text-right text-[10px] text-base-content/40">Đã xử lý</p>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        )}
      </div>

      {dismissTarget && (
        <ConfirmModal
          title="Từ chối báo cáo này?"
          description="Trust score của người báo cáo sẽ bị giảm. Hành động này không hiện ngay cách hoàn tác trên giao diện."
          confirmLabel="Từ chối báo cáo"
          onConfirm={() => handleResolve(dismissTarget, 'dismissed')}
          onCancel={() => setDismissTarget(null)}
        />
      )}

      {approvedUser && (
        <Modal onClose={() => setApprovedUser(null)} boxClassName="max-w-sm bg-base-100 border border-base-300 shadow-2xl">
          <h3 className="text-base font-bold mb-4">Người bị báo cáo</h3>
          <div className="flex items-center gap-3 mb-5">
            <div className="avatar">
              <div className="w-14 h-14 rounded-full">
                {approvedUser.avatar ? (
                  <img src={approvedUser.avatar} alt="avatar" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-primary text-primary-content font-bold text-lg">
                    {(approvedUser.nickname || approvedUser.username || '?')[0].toUpperCase()}
                  </div>
                )}
              </div>
            </div>
            <div>
              <p className="font-bold">{approvedUser.nickname || approvedUser.username}</p>
              <p className="text-xs text-base-content/50">@{approvedUser.username}</p>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button onClick={() => setApprovedUser(null)} size="sm" pill className="bg-base-200">
              Đóng
            </Button>
            <Button
              disabled
              title="Tính năng đang phát triển"
              variant="error" size="sm" pill className="opacity-50 cursor-not-allowed"
            >
              Hạn chế
            </Button>
          </div>
        </Modal>
      )}

      {showProfile && <ProfileModal onClose={() => setShowProfile(false)} />}
    </div>
  );
}
