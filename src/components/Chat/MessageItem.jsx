import { format, formatDistanceToNow } from 'date-fns';
import { vi } from 'date-fns/locale';
import { useState, useEffect, memo, useMemo } from 'react';
import { MoreVertical, Timer } from '../icons';
import { toast } from '../common/toastStore';
import Modal from '../common/Modal';
import Button from '../common/Button';
import ConfirmModal from '../common/ConfirmModal';
import Spinner from '../common/Spinner';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../hooks/useSocket';
import { Capacitor } from '@capacitor/core';
import { HugeiconsIcon } from '@hugeicons/react';
import { AlertCircleIcon, CryingIcon, Download01Icon, File01Icon, HappyIcon, InLoveIcon, LaughingIcon, ReplyIcon, SurpriseIcon } from '@hugeicons/core-free-icons';
import ReportModal from './ReportModal';
import LinkPreview from './LinkPreview';
import useElementVisibility from '../../hooks/useElementVisibility';
import { URL_REGEX } from '../../utils/mediaGalleryFilter';
import { isOnDeviceEnabled, transcribeOnDevice } from '../../utils/onDeviceTranscriber';
import {
  attachmentPointer, getDecryptedAttachmentBlob, saveDecryptedBlob, attachmentFileName,
} from '../../utils/attachmentDecrypt';


// Tải ciphertext R2 qua URL ngắn hạn, giải mã và bỏ padding/nén hoàn toàn ở client.
function useDecryptedBlob(message, shouldLoad) {
  const { user } = useAuth();
  const [blobUrl, setBlobUrl] = useState(null);
  const [blob, setBlob] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let objectUrl = null;

    (async () => {
        if (!shouldLoad || !message.__key || !attachmentPointer(message)) return;
      try {
        const { blob: plainBlob } = await getDecryptedAttachmentBlob(message, user._id);
        if (cancelled) return;
        objectUrl = URL.createObjectURL(plainBlob);
        setBlob(plainBlob);
        setBlobUrl(objectUrl);
      } catch (err) {
        console.error('[E2EE] Giải mã file thất bại:', err);
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [shouldLoad, user?._id, message]);

  return { blobUrl, blob, failed };
}

function EncryptedImage({ message, className, onClick }) {
  const [attachmentRef, visible] = useElementVisibility();
  const { blobUrl, failed } = useDecryptedBlob(message, visible);

  if (failed) {
    return (
      <div ref={attachmentRef} className={`${className} flex items-center justify-center gap-1 bg-base-200 text-xs text-base-content/50 text-center p-2`}>
        <HugeiconsIcon icon={AlertCircleIcon} size={14} strokeWidth={1.8} /> Không thể giải mã ảnh
      </div>
    );
  }

  if (!blobUrl) {
    return (
      <div ref={attachmentRef} className={`${className} flex items-center justify-center bg-base-200`}>
        <Spinner size="sm" className="text-base-content/40" />
      </div>
    );
  }

  return <img ref={attachmentRef} src={blobUrl} alt="Hình ảnh đính kèm" className={className} onClick={onClick} />;
}

function EncryptedAudio({ message, className }) {
  const [attachmentRef, visible] = useElementVisibility();
  const { blobUrl, blob, failed } = useDecryptedBlob(message, visible);
  const [transcript, setTranscript] = useState(null);
  const [transcribing, setTranscribing] = useState(false);
  const [transcribeError, setTranscribeError] = useState(false);

  const onDevice = isOnDeviceEnabled();

  const handleTranscribe = async () => {
    if (!blob) return;
    setTranscribing(true);
    setTranscribeError(false);
    try {
      setTranscript(await transcribeOnDevice(blob));
    } catch (err) {
      console.error('[Transcribe] Lỗi:', err);
      setTranscribeError(true);
    } finally {
      setTranscribing(false);
    }
  };

  if (failed) {
    return (
      <div ref={attachmentRef} className={`${className} flex items-center gap-1 text-xs text-error/80 font-semibold px-2`}>
        <HugeiconsIcon icon={AlertCircleIcon} size={14} strokeWidth={1.8} /> Không thể giải mã tin nhắn thoại
      </div>
    );
  }

  if (!blobUrl) {
    return (
      <div ref={attachmentRef} className={`${className} flex items-center px-2`}>
        <Spinner size="sm" className="text-base-content/40" />
      </div>
    );
  }

  return (
    <div ref={attachmentRef} className="flex flex-col gap-1">
      <audio src={blobUrl} controls className={className} />
      {transcript ? (
        <p className="text-xs px-1">{transcript}</p>
      ) : onDevice ? (
        <div className="flex flex-col gap-0.5 px-1">
          <button
            type="button"
            onClick={handleTranscribe}
            disabled={transcribing}
            className="text-[11px] text-primary hover:underline font-semibold cursor-pointer text-left w-fit disabled:opacity-50"
          >
            {transcribing ? 'Đang xử lý trên máy... (lần đầu có thể mất chút thời gian để tải model)' : 'Xem bản dịch chữ'}
          </button>
          {transcribeError && (
            <span className="text-[11px] text-error">Không thể chuyển thành văn bản, thử lại</span>
          )}
          <span className="text-[10px] text-base-content/40">Xử lý ngay trên thiết bị này — audio không rời khỏi máy</span>
        </div>
      ) : (
        <span className="text-[10px] text-base-content/40 px-1">
          Bật "Phiên âm giọng nói trên thiết bị" trong Cài đặt để xem bản dịch chữ
        </span>
      )}
    </div>
  );
}

function EncryptedAttachmentDownload({ message, className, title = 'Tải xuống' }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);

  const handleDownload = async () => {
    if (loading) return;
    const pointer = attachmentPointer(message);
    const fileName = attachmentFileName(message, pointer);
    setLoading(true);
    try {
      // Web cần mở picker trong click đồng bộ; Android luôn lưu vào Downloads mặc định.
      const fileHandle = !Capacitor.isNativePlatform() && typeof window.showSaveFilePicker === 'function'
        ? await window.showSaveFilePicker({ suggestedName: fileName })
        : null;
      const { blob } = await getDecryptedAttachmentBlob(message, user._id);
      if (await saveDecryptedBlob(blob, fileName, fileHandle)) toast.success('Đã tải xuống');
    } catch (err) {
      if (err?.name !== 'AbortError') {
        console.error('[E2EE] Tải file thất bại:', err);
        toast.error('Không thể tải file');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <button type="button" onClick={handleDownload} disabled={loading} className={className} title={title} aria-label={title}>
      <HugeiconsIcon icon={Download01Icon} size={16} strokeWidth={1.8} />
    </button>
  );
}

// File chung (tới 50MB) chỉ giải mã khi bấm mở, không tự tải như ảnh/audio. Mở tab trắng NGAY lúc
// click (đồng bộ) rồi set location sau khi giải mã — mở sau await dễ bị trình duyệt chặn popup.
function EncryptedFileLink({ message, className, title, children }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const handleClick = async (e) => {
    e.preventDefault();
    if (loading) return;
    setFailed(false);
    setLoading(true);
    const newTab = window.open('', '_blank');

    try {
      const { blob: plainBlob } = await getDecryptedAttachmentBlob(message, user._id);
      const blobUrl = URL.createObjectURL(plainBlob);
      if (newTab) {
        newTab.location.href = blobUrl;
      }
      // Thu hồi sau 1 phút — đủ thời gian trình duyệt mở/tải xong tab mới trước khi giải phóng.
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    } catch (err) {
      console.error('[E2EE] Giải mã file thất bại:', err);
      if (newTab) newTab.close();
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button type="button" onClick={handleClick} disabled={loading} className={className} title={title}>
      {loading ? 'Đang giải mã...' : failed ? 'Lỗi giải mã, thử lại' : children}
    </button>
  );
}

const EMOJIS = ['👍', '❤️', '😂', '😮', '😢'];
const REACTION_ICONS = {
  '👍': HappyIcon,
  '❤️': InLoveIcon,
  '😂': LaughingIcon,
  '😮': SurpriseIcon,
  '😢': CryingIcon,
};

function ReactionIcon({ emoji }) {
  const icon = REACTION_ICONS[emoji];
  return icon ? <HugeiconsIcon icon={icon} size={16} strokeWidth={1.8} /> : <span>{emoji}</span>;
}

function MessageItem({ message, onReact, onReply, isDM, seenAt, onForwardClick, onEdit, onViewProfile, canPin, isPinned, onPinMessage, onUnpinMessage, onPollVote, messageTextColor }) {
  const { user } = useAuth();
  const { emit } = useSocket();
  const isOwn = message.sender._id?.toString() === user._id?.toString();
  const senderName = message.sender.nickname || message.sender.username;
  const currentAttachment = attachmentPointer(message);

  const firstLinkUrl = useMemo(
    () => (message.type === 'text' && !message.isDeleted) ? message.content?.match(URL_REGEX)?.[0] : null,
    [message.type, message.isDeleted, message.content],
  );

  const [showActions, setShowActions] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [showImageViewer, setShowImageViewer] = useState(false);
  const [showRecallConfirm, setShowRecallConfirm] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content)
      .then(() => toast.success('Đã sao chép tin nhắn vào bộ nhớ tạm'))
      .catch(err => console.error('Không thể sao chép:', err));
    setShowActions(false);
  };

  const openRecallConfirm = () => {
    setShowActions(false);
    setShowRecallConfirm(true);
  };

  const handleRecall = () => {
    emit('message:delete', { messageId: message._id }, (response) => {
      if (response?.success) {
        toast.success('Đã thu hồi tin nhắn');
      } else {
        toast.error(response?.message || 'Không thể thu hồi tin nhắn');
      }
    });
    setShowRecallConfirm(false);
  };

  const handleStartEdit = () => {
    setIsEditing(true);
    setEditValue(message.content);
    setShowActions(false);
  };

  const handleSaveEdit = () => {
    if (!editValue.trim()) return;
    if (onEdit) {
      onEdit(message._id, editValue);
    } else {
      emit('message:edit', { messageId: message._id, newContent: editValue });
    }
    setIsEditing(false);
  };

  const handleForward = () => {
    setShowActions(false);
    if (onForwardClick) onForwardClick(message);
  };

  const handlePin = () => {
    setShowActions(false);
    if (isPinned) onUnpinMessage?.();
    else onPinMessage?.(message._id);
  };

  const poll = (() => {
    if (message.type !== 'poll') return null;
    try {
      const value = JSON.parse(message.content);
      return Array.isArray(value.options) && value.question ? value : null;
    } catch {
      return null;
    }
  })();

  const pollVotes = Object.values(message.pollVotes || {}).reduce((counts, vote) => {
    try {
      const index = JSON.parse(vote).optionIndex;
      if (Number.isInteger(index)) counts[index] = (counts[index] || 0) + 1;
    } catch {
      // Poll payload không hợp lệ thì không cộng phiếu.
    }
    return counts;
  }, {});
  const myPollVote = message.pollVotes?.[user._id?.toString()];
  let myPollOption = null;
  try { myPollOption = JSON.parse(myPollVote).optionIndex; } catch {
    // Không có hoặc không đọc được phiếu của chính mình.
  }

  const handleToggleActions = (e) => {
    e.stopPropagation();
    setShowActions(prev => !prev);
  };

  useEffect(() => {
    if (!showActions) return;
    const handleClose = () => setShowActions(false);
    document.addEventListener('click', handleClose);
    return () => document.removeEventListener('click', handleClose);
  }, [showActions]);

  const handleScrollToOriginal = () => {
    if (!message.replyTo?._id) return;
    const target = document.getElementById(`msg-${message.replyTo._id}`);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target.classList.add('bg-primary/10', 'ring-2', 'ring-primary/20', 'p-1');
      setTimeout(() => {
        target.classList.remove('bg-primary/10', 'ring-2', 'ring-primary/20', 'p-1');
      }, 1500);
    }
  };

  if (message.isDeleted) {
    return (
      <div id={`msg-${message._id}`} className={`flex flex-col mb-2 px-2 transition-all duration-300 rounded-lg ${isOwn ? 'items-end' : 'items-start'}`}>
        <div className="flex items-end gap-2">
          {!isOwn && (
            <div className="w-8 h-8 rounded-full bg-base-200 flex-shrink-0" />
          )}
          <div className={`chat-bubble chat-bubble-neutral text-xs italic text-base-content/40 bg-base-200 border border-base-300 ${
            isOwn ? 'rounded-br-[4px]' : 'rounded-bl-[4px]'
          }`}>
            Tin nhắn đã bị thu hồi
          </div>
        </div>
      </div>
    );
  }

  return (
    <div id={`msg-${message._id}`} className={`flex flex-col mb-2 px-2 transition-all duration-300 rounded-lg ${isOwn ? 'items-end' : 'items-start'}`}>
      
      {!isOwn && !isDM && (
        <span
          onClick={() => onViewProfile && onViewProfile(message.sender._id)}
          className="text-[10px] text-base-content/50 font-semibold mb-0.5 ml-10 hover:underline cursor-pointer hover:text-primary transition-colors"
        >
          {senderName}
        </span>
      )}

      {isPinned && (
        <span className={`text-[10px] font-semibold text-warning mb-0.5 ${isOwn ? 'mr-2' : 'ml-10'}`}>📌 Đã ghim</span>
      )}

      {/* Discord-style Reply Preview */}
      {message.replyTo && (
        <div
          onClick={handleScrollToOriginal}
          className={`flex items-center text-[11px] text-base-content/50 mb-1 select-none cursor-pointer hover:opacity-85 transition-opacity ${
            isOwn ? 'flex-row-reverse mr-2' : 'ml-4'
          }`}
          title="Cuộn tới tin nhắn gốc"
        >
          <div className={`w-6 h-3 border-t-2 border-base-300 flex-shrink-0 ${
            isOwn
              ? 'border-r-2 rounded-tr-md ml-1.5'
              : 'border-l-2 rounded-tl-md mr-1.5'
          }`} style={{ marginTop: '6px' }} />

          <div className="avatar">
            <div className="w-4 rounded-full bg-base-300 mr-1.5">
              {message.replyTo.sender?.avatar ? (
                <img src={message.replyTo.sender.avatar} alt="avatar" />
              ) : (
                <div className="w-full h-full bg-neutral text-[8px] text-neutral-content flex items-center justify-center font-bold">
                  {(message.replyTo.sender?.nickname || message.replyTo.sender?.username || 'U')[0].toUpperCase()}
                </div>
              )}
            </div>
          </div>

          <span className="font-bold text-base-content/70 mr-1.5 hover:underline">
            @{message.replyTo.sender?.nickname || message.replyTo.sender?.username}
          </span>

          {/* Ẩn URL Cloudinary trần cho ảnh/audio/file — chỉ hiện nhãn tĩnh, không phải nội dung thật */}
          <span className="text-base-content/40 truncate max-w-[200px] italic">
            {message.replyTo.isDeleted ? 'Tin nhắn đã bị thu hồi' : (
              message.replyTo.type === 'audio' ? 'Tin nhắn thoại' :
              message.replyTo.type === 'image' ? '[Hình ảnh]' :
              message.replyTo.type === 'file' ? `[Tệp: ${message.replyTo.fileName || 'Tài liệu'}]` :
              message.replyTo.content
            )}
          </span>
        </div>
      )}

      {message.forwardedFrom && (
        <div className={`flex items-center text-[10px] text-base-content/40 gap-1 mb-0.5 select-none ${isOwn ? 'mr-2' : 'ml-10'}`}>
          <HugeiconsIcon icon={ReplyIcon} size={12} strokeWidth={1.8} />
          <span>
            Chuyển tiếp từ{' '}
            <span className="font-semibold text-base-content/60">
              {message.forwardedFrom.sender?.nickname || message.forwardedFrom.sender?.username || 'Người dùng'}
            </span>
          </span>
        </div>
      )}

      {/* Hàng tin nhắn chính */}
      <div className={`flex items-end gap-2.5 max-w-full group/msg relative ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
        
        {!isOwn && (
          <div
            className="avatar flex-shrink-0 cursor-pointer hover:opacity-90 transition-opacity"
            onClick={() => onViewProfile && onViewProfile(message.sender._id)}
          >
            <div className="w-8 rounded-full ring-1 ring-base-300" title={`Xem profile của ${senderName}`}>
              {message.sender.avatar ? (
                <img src={message.sender.avatar} alt="avatar" />
              ) : (
                <div className="w-full h-full bg-primary text-primary-content flex items-center justify-center font-bold text-xs">
                  <span>{senderName[0].toUpperCase()}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Bong bóng tin nhắn */}
        <div className="relative max-w-full">
          <div
            className={`text-[14px] leading-relaxed whitespace-pre-wrap break-words shadow-2xs ${
              message.type === 'audio' || message.type === 'image' || message.type === 'file'
                ? 'bg-transparent shadow-none'
                : isOwn
                  ? 'chat-bubble chat-bubble-primary rounded-2xl rounded-br-[4px] px-3.5 py-2 max-w-[min(75vw,26rem)]'
                  : 'chat-bubble bg-base-200 text-base-content rounded-2xl rounded-bl-[4px] px-3.5 py-2 max-w-[min(75vw,26rem)]'
            }`}
            title={format(new Date(message.createdAt), 'HH:mm')}
            style={messageTextColor ? { color: messageTextColor } : undefined}
          >
            {message.type === 'poll' ? (
              poll ? (
                <div className="flex flex-col gap-2 min-w-[220px]">
                  <span className="font-bold">📊 {poll.question}</span>
                  {poll.options.map((option, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => onPollVote?.(message._id, index)}
                      className={`btn btn-sm justify-between normal-case ${myPollOption === index ? 'btn-primary' : 'btn-ghost bg-base-100/30'}`}
                    >
                      <span className="truncate">{option}</span>
                      <span className="ml-3 font-bold">{pollVotes[index] || 0}</span>
                    </button>
                  ))}
                  <span className="text-[10px] opacity-60">{Object.keys(message.pollVotes || {}).length} phiếu bầu</span>
                </div>
              ) : <span>Không thể đọc khảo sát</span>
            ) : message.type === 'audio' ? (
              <div className="relative inline-block">
                <EncryptedAudio
                  message={message}
                  className={`w-[360px] max-w-full rounded-lg p-1 ${isOwn ? 'bg-primary/10' : 'bg-base-200'} focus:outline-none`}
                />
              </div>
            ) : message.type === 'image' ? (
              <div className="relative inline-block">
                <EncryptedImage
                  message={message}
                  className="w-[160px] h-[160px] rounded-2xl cursor-pointer object-cover border border-base-300 shadow-xs hover:opacity-90 transition-opacity"
                  onClick={() => setShowImageViewer(true)}
                />
              </div>
            ) : message.type === 'file' ? (
              <div className={`flex items-center gap-3 rounded-2xl p-3.5 max-w-[240px] border shadow-3xs ${
                isOwn
                  ? 'bg-primary border-primary/70 text-primary-content'
                  : 'bg-base-200 border-base-300 text-base-content'
              }`}>
                <HugeiconsIcon icon={File01Icon} size={24} strokeWidth={1.8} className="shrink-0" />
                <div className="flex flex-col min-w-0">
                  <EncryptedFileLink
                    message={message}
                    className={`text-[13px] font-semibold truncate hover:underline cursor-pointer text-left ${
                      isOwn ? 'text-primary-content' : 'text-primary'
                    }`}
                    title={currentAttachment?.name || message.fileName || 'Mở file'}
                  >
                    {currentAttachment?.name || message.fileName || 'Tệp đính kèm'}
                  </EncryptedFileLink>
                  <span className={`text-[10px] font-medium mt-0.5 ${isOwn ? 'text-primary-content/70' : 'text-base-content/40'} flex items-center gap-1`}>
                    Tệp đính kèm
                    <EncryptedAttachmentDownload
                      message={message}
                      className="inline-flex items-center justify-center hover:opacity-70 disabled:opacity-50 cursor-pointer"
                      title="Tải xuống tệp"
                    />
                  </span>
                </div>
              </div>
            ) : (
              isEditing ? (
                <div className="flex flex-col gap-1.5 min-w-[200px] py-1">
                  <textarea
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    className="textarea textarea-bordered textarea-xs w-full bg-base-100 text-base-content resize-none"
                    rows={2}
                  />
                  <div className="flex justify-end gap-1.5">
                    <Button
                      onClick={() => setIsEditing(false)}
                      size="xs" className="bg-base-200"
                    >
                      Hủy
                    </Button>
                    <Button
                      onClick={handleSaveEdit}
                      variant="primary" size="xs"
                    >
                      Lưu
                    </Button>
                  </div>
                </div>
              ) : (
                <span>
                  {message.content}
                  {message.isEdited && (
                    <span 
                      className="text-[9px] opacity-60 ml-1.5 select-none font-medium text-inherit"
                      title="Tin nhắn đã qua chỉnh sửa"
                    >
                      (đã chỉnh sửa)
                    </span>
                  )}
                </span>
              )
            )}
          </div>

          {firstLinkUrl && !isEditing && <LinkPreview url={firstLinkUrl} />}

          {message.expiresAt && (
            <div
              className={`flex items-center gap-1 mt-0.5 text-[10px] text-base-content/40 ${isOwn ? 'justify-end' : 'justify-start'}`}
              title={`Tự hủy lúc ${format(new Date(message.expiresAt), 'HH:mm dd/MM')}`}
            >
              <Timer className="w-2.5 h-2.5" />
              <span>Tự hủy sau {formatDistanceToNow(new Date(message.expiresAt), { locale: vi })}</span>
            </div>
          )}

          {isOwn && seenAt && new Date(seenAt) >= new Date(message.createdAt) && (
            <p className="text-[10px] text-base-content/40 text-right mt-0.5 mr-1">
              Đã xem lúc {format(new Date(seenAt), 'HH:mm')}
            </p>
          )}

          {/* Reactions dưới chân bong bóng chat, bọc dòng khớp chiều rộng bong bóng */}
          {message.reactions?.length > 0 && (
            <div className={`flex flex-wrap gap-0.5 mt-1 max-w-[min(75vw,26rem)] ${isOwn ? 'justify-end' : 'justify-start'}`}>
              {message.reactions.map(r => {
                const hasReacted = r.users.some(u => {
                  const uid = typeof u === 'object' && u !== null ? u._id : u;
                  return uid?.toString() === user._id?.toString();
                });
                
                const reactorNames = r.users
                  .map(u => (typeof u === 'object' && u !== null ? (u.nickname || u.username) : 'Người dùng'))
                  .join(', ');

                return (
                  <div key={r.emoji} className="relative group/react inline-block">
                    <button
                      className={`badge gap-1 cursor-pointer select-none active:scale-95 transition-all ${
                        hasReacted
                          ? 'badge-primary badge-outline'
                          : 'badge-ghost bg-base-200'
                      }`}
                      onClick={() => onReact(message._id, r.emoji)}
                    >
                      <ReactionIcon emoji={r.emoji} />
                      <span className="font-bold opacity-85">{r.users.length}</span>
                    </button>

                    {reactorNames && (
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover/react:flex flex-col items-center z-30">
                        <div className="bg-neutral text-neutral-content text-[9px] font-semibold px-2 py-1 rounded-md shadow-md whitespace-nowrap leading-tight text-center">
                          {reactorNames}
                        </div>
                        <div className="w-1.5 h-1.5 bg-neutral rotate-45 -mt-0.5" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Hover Menu thao tác (Emoji + Trả lời + Menu 3 chấm ⋮) */}
        <div
          className={`absolute top-1/2 -translate-y-1/2 flex gap-0.5 bg-base-100 border border-base-300 shadow-sm p-1 rounded-full z-20 transition-all ${
            isOwn ? 'left-[-170px]' : 'right-[-170px]'
          } ${showActions ? 'opacity-100 pointer-events-auto scale-100' : 'opacity-0 scale-95 pointer-events-none group-hover/msg:opacity-100 group-hover/msg:pointer-events-auto group-hover/msg:scale-100'}`}
        >
          {EMOJIS.map(emoji => (
            <Button
              key={emoji}
              onClick={() => onReact(message._id, emoji)}
              size="xs" circle className="text-xs"
            >
              <ReactionIcon emoji={emoji} />
            </Button>
          ))}
          <Button
            onClick={() => onReply(message)}
            size="xs" pill className="hover:!text-primary"
          >
            Reply
          </Button>

          <div className="dropdown dropdown-top">
            <Button
              tabIndex={0}
              onClick={handleToggleActions}
              size="xs" circle
              title="Thao tác khác"
            >
              <MoreVertical className="w-3.5 h-3.5" />
            </Button>

            {/* Dropdown Menu hành động */}
            {showActions && (
              <ul className={`dropdown-content menu menu-sm bg-base-100 border border-base-300 rounded-lg shadow-lg py-1 min-w-[110px] z-30 ${
                isOwn ? 'right-0' : 'left-0'
              }`}>
                {message.type === 'text' && (
                  <li>
                    <button onClick={handleCopy} className="text-[11px] font-semibold">
                      Sao chép
                    </button>
                  </li>
                )}
                <li>
                  <button onClick={handleForward} className="text-[11px] font-semibold">
                    Chuyển tiếp
                  </button>
                </li>
                {canPin && (
                  <li>
                    <button onClick={handlePin} className="text-[11px] font-semibold">
                      {isPinned ? 'Bỏ ghim' : 'Ghim tin nhắn'}
                    </button>
                  </li>
                )}
                {isOwn && message.type === 'text' && (
                  <li>
                    <button onClick={handleStartEdit} className="text-[11px] font-semibold">
                      Chỉnh sửa
                    </button>
                  </li>
                )}
                {isOwn && (
                  <li>
                    <button onClick={openRecallConfirm} className="text-[11px] font-bold text-error">
                      Thu hồi
                    </button>
                  </li>
                )}
                {!isOwn && (
                  <li>
                    <button
                      onClick={() => {
                        setShowActions(false);
                        setShowReportModal(true);
                      }}
                      className="text-[11px] font-bold text-error"
                    >
                      🚩 Báo cáo
                    </button>
                  </li>
                )}
              </ul>
            )}
          </div>
        </div>

      </div>

      {showImageViewer && (
        <Modal onClose={() => setShowImageViewer(false)} boxClassName="p-0 bg-transparent shadow-none border-none max-w-3xl">
          <div className="relative">
            <EncryptedImage message={message} className="max-w-full max-h-[85vh] rounded-lg mx-auto" />
            <EncryptedAttachmentDownload
              message={message}
              className="btn btn-circle btn-sm absolute top-2 right-2 bg-base-100/90 border-base-300 shadow-sm"
              title="Tải xuống ảnh"
            />
          </div>
        </Modal>
      )}

      {showReportModal && (
        <ReportModal
          message={message}
          onClose={() => setShowReportModal(false)}
          onSuccess={(msg) => toast.success(msg)}
        />
      )}

      {showRecallConfirm && (
        <ConfirmModal
          title="Thu hồi tin nhắn này?"
          description="Tin nhắn sẽ hiện thành “Tin nhắn đã bị thu hồi” với tất cả mọi người trong cuộc trò chuyện."
          confirmLabel="Thu hồi"
          onConfirm={handleRecall}
          onCancel={() => setShowRecallConfirm(false)}
        />
      )}
    </div>
  );
}

export default memo(MessageItem);
