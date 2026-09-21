import { useState } from 'react';
import Button from '../common/Button';
import Modal from '../common/Modal';

// Thêm một mục ở đây khi UI có quyền mới. Server vẫn cần khai báo cùng key trong ROOM_PERMISSIONS.
const PERMISSIONS = [
  { key: 'pin_messages', label: 'Ghim tin nhắn', adminHas: true },
  { key: 'create_polls', label: 'Tạo cuộc khảo sát', adminHas: true },
];

function roleOf({ isOwner, isAdmin }) {
  return isOwner ? 'host' : isAdmin ? 'admin' : 'user';
}

export default function RoomPermissionsTab({
  roomMembers, ownerId, admins, grantedPermissions, user, setConfirmAction,
}) {
  const [permissionMember, setPermissionMember] = useState(null);

  const getMember = m => {
    const memberId = m._id?.toString();
    const isOwner = ownerId === memberId;
    const isAdmin = admins.includes(memberId);
    return {
      memberId,
      memberName: m.nickname || m.username,
      isOwner,
      isAdmin,
      role: roleOf({ isOwner, isAdmin }),
      permissions: grantedPermissions[memberId] || [],
    };
  };

  const requestRoleChange = (member, nextRole) => {
    const type = nextRole === 'host' ? 'transfer'
      : nextRole === 'admin' ? 'promote'
        : 'demote';
    setConfirmAction({ type, memberId: member.memberId, memberName: member.memberName });
  };

  const hasPermission = (member, permission) => (
    member.isOwner || (member.isAdmin ? permission.adminHas : member.permissions.includes(permission.key))
  );

  return (
    <>
      <div className="w-full max-h-80 overflow-auto rounded-lg border border-base-300">
        <table className="table table-xs table-pin-rows whitespace-nowrap">
          <thead>
            <tr>
              <th>Tên</th>
              <th>Vai trò</th>
              <th>Quyền</th>
            </tr>
          </thead>
          <tbody>
            {roomMembers.map(m => {
              const member = getMember(m);
              const isSelf = member.memberId === user._id?.toString();
              return (
                <tr key={member.memberId}>
                  <td className="font-semibold max-w-36 truncate" title={member.memberName}>
                    {member.memberName}{isSelf ? ' (Bạn)' : ''}
                  </td>
                  <td>
                    <select
                      value={member.role}
                      disabled={member.isOwner}
                      title={member.isOwner ? 'Hãy chuyển Host cho thành viên khác trước' : undefined}
                      onChange={e => requestRoleChange(member, e.target.value)}
                      className="select select-xs select-bordered w-20"
                    >
                      <option value="host">Host</option>
                      <option value="admin">Admin</option>
                      <option value="user">User</option>
                    </select>
                  </td>
                  <td>
                    <Button
                      size="xs"
                      className="normal-case"
                      onClick={() => setPermissionMember(member)}
                    >
                      Quyền
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {permissionMember && (
        <Modal onClose={() => setPermissionMember(null)} boxClassName="max-w-sm bg-base-100 border border-base-300 shadow-2xl">
          <h3 className="text-base font-bold">Quyền của {permissionMember.memberName}</h3>
          <div className="mt-4 space-y-3">
            {PERMISSIONS.map(permission => {
              const inherited = permissionMember.isOwner || permissionMember.isAdmin;
              return (
                <label key={permission.key} className="flex items-center justify-between gap-4 text-sm">
                  <span>{permission.label}</span>
                  <select
                    value={hasPermission(permissionMember, permission) ? 'yes' : 'no'}
                    disabled={inherited}
                    title={inherited ? 'Quyền này được quyết định bởi vai trò hiện tại' : undefined}
                    onChange={e => setConfirmAction({
                      type: e.target.value === 'yes' ? 'grant-permission' : 'revoke-permission',
                      memberId: permissionMember.memberId,
                      memberName: permissionMember.memberName,
                      permission: permission.key,
                    })}
                    className="select select-sm select-bordered w-20"
                  >
                    <option value="yes">Có</option>
                    <option value="no">Không</option>
                  </select>
                </label>
              );
            })}
          </div>
          <div className="mt-5 flex justify-end">
            <Button size="sm" onClick={() => setPermissionMember(null)}>Đóng</Button>
          </div>
        </Modal>
      )}
    </>
  );
}
