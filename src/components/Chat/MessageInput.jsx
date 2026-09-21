import { useState, useRef, useEffect } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Cancel01Icon, File01Icon, ReplyIcon } from '@hugeicons/core-free-icons';
import { Paperclip, Mic, Pencil, Plus, Send, Trash2, Timer } from '../icons';
import Button from '../common/Button';
import { toast } from '../common/toastStore';
import { checkLink } from '../../api/security.api';
import { scanLinksInText } from '../../utils/securityScan';
import { safeGet, safeSet, safeRemove } from '../../utils/safeStorage';
import useVoiceRecorder from '../../hooks/chat/useVoiceRecorder';
import useDictation from '../../hooks/chat/useDictation';
import useConfirm from '../../hooks/useConfirm';

// Phải khớp giới hạn multer ở server (server/src/routes/rooms.js) — chặn sớm ở client, server vẫn enforce thật.
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const MAX_FILE_SIZE  = 25 * 1024 * 1024;
// Giới hạn plaintext — Message.content (ciphertext) maxlength: 2000 còn dư biên độ cho AES-GCM+base64.
const MAX_MESSAGE_LENGTH = 1500;

// Tin nhắn tự hủy chỉ người gửi chọn, không đồng bộ server/người khác — nhớ tạm theo phòng qua localStorage.
const TTL_OPTIONS = [
  { label: 'Tắt', value: null },
  { label: '1 phút', value: 60 },
  { label: '1 giờ', value: 3600 },
  { label: '24 giờ', value: 86400 },
  { label: '7 ngày', value: 604800 },
];

export default function MessageInput({ onSend, onTyping, replyTo, onCancelReply, roomId }) {
  const [content, setContent]   = useState('');
  const typingTimeout           = useRef(null);
  const isTypingRef             = useRef(false);
  const { confirm, confirmModal } = useConfirm();
  const readSavedTtl = (rid) => {
    if (!rid) return null;
    const saved = safeGet(localStorage, `disappearing_ttl_${rid}`);
    return saved ? Number(saved) : null;
  };
  const [ttlSeconds, setTtlSeconds] = useState(() => readSavedTtl(roomId));
  const [showTtlMenu, setShowTtlMenu] = useState(false);
  // Chuyển phòng thì đọc lại lựa chọn đã lưu — chỉnh state ngay lúc render, không dùng effect.
  const [ttlRoomId, setTtlRoomId] = useState(roomId);
  if (roomId !== ttlRoomId) {
    setTtlRoomId(roomId);
    setTtlSeconds(readSavedTtl(roomId));
  }

  const handlePickTtl = (value) => {
    setTtlSeconds(value);
    setShowTtlMenu(false);
    if (!roomId) return;
    if (value) safeSet(localStorage, `disappearing_ttl_${roomId}`, String(value));
    else safeRemove(localStorage, `disappearing_ttl_${roomId}`);
  };

  const [isSending, setIsSending] = useState(false);
  const [checkingLink, setCheckingLink] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const fileInputRef = useRef(null);
  const messageInputRef = useRef(null);
  const selectedFilesRef = useRef([]);

  useEffect(() => {
    selectedFilesRef.current = selectedFiles;
  }, [selectedFiles]);

  useEffect(() => {
    const input = messageInputRef.current;
    if (!input) return;
    input.style.height = 'auto';
    const maxHeight = parseFloat(getComputedStyle(input).maxHeight);
    input.style.height = `${Math.min(input.scrollHeight, maxHeight)}px`;
    input.style.overflowY = input.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }, [content]);

  // Dùng chung cho cả chọn qua input file lẫn kéo-thả — validate size + tạo preview giống hệt nhau
  const addFiles = (fileList) => {
    const files = Array.from(fileList);
    if (files.length === 0) return;

    const newFiles = [];
    files.forEach(file => {
      const isImage = file.type.startsWith('image/');
      const maxSize = isImage ? MAX_IMAGE_SIZE : MAX_FILE_SIZE;

      if (file.size > maxSize) {
        toast.error(isImage ? 'Ảnh không được vượt quá 10MB' : 'File không được vượt quá 25MB');
        return;
      }

      newFiles.push({
        id: Date.now() + Math.random(),
        file: file,
        previewUrl: isImage ? URL.createObjectURL(file) : null,
        isImage: isImage
      });
    });

    setSelectedFiles(prev => [...prev, ...newFiles]);
  };

  const handleFileChange = (e) => {
    addFiles(e.target.files);
    e.target.value = '';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    if (!isSending) setIsDraggingFile(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDraggingFile(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDraggingFile(false);
    if (isSending || !e.dataTransfer.files?.length) return;
    addFiles(e.dataTransfer.files);
  };

  const removeSelectedFile = (idToRemove) => {
    setSelectedFiles(prev => {
      const item = prev.find(f => f.id === idToRemove);
      if (item && item.previewUrl) {
        URL.revokeObjectURL(item.previewUrl);
      }
      return prev.filter(f => f.id !== idToRemove);
    });
  };
  const {
    isRecording, recordingTime, isUploading,
    startRecording, cancelRecording, stopAndSendRecording,
  } = useVoiceRecorder({ onSend, replyTo, ttlSeconds, onError: toast.error });

  // Nút riêng "Đọc thành chữ" — chữ nhận diện nối tiếp content đã gõ sẵn (baseContentRef chụp lúc bật).
  const baseContentRef = useRef('');
  const dictation = useDictation({
    onResult: (transcript) => {
      const base = baseContentRef.current;
      setContent((base + (base && transcript ? ' ' : '') + transcript).slice(0, MAX_MESSAGE_LENGTH));
    },
  });

  const handleToggleDictation = () => {
    if (dictation.isListening) {
      dictation.stop();
    } else {
      baseContentRef.current = content;
      dictation.start();
    }
  };

  const handleChange = (e) => {
    setContent(e.target.value);
    // Chỉ báo "bắt đầu gõ" 1 lần/đợt, không phải mỗi phím.
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      onTyping(true);
    }
    clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => {
      isTypingRef.current = false;
      onTyping(false);
    }, 1500);
  };

  // maxLength đã chặn cứng, chỉ báo lý do phím vừa gõ không có tác dụng (bỏ qua phím điều khiển/Ctrl+Cmd).
  const handleKeyDownContent = (e) => {
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && content.length >= MAX_MESSAGE_LENGTH) {
      toast.error(`Tin nhắn không được vượt quá ${MAX_MESSAGE_LENGTH} ký tự`);
    }
  };

  const handleCheckLink = async () => {
    const url = scanLinksInText(content).urls[0];
    if (!url || checkingLink) return;
    const accepted = await confirm(
      'Kiểm tra liên kết bên ngoài?',
      'URL này sẽ được gửi tới dịch vụ Safe Browsing để kiểm tra. Nội dung tin nhắn khác vẫn không rời khỏi E2EE.',
      { confirmLabel: 'Kiểm tra', cancelLabel: 'Hủy' },
    );
    if (!accepted) return;
    setCheckingLink(true);
    try {
      const result = await checkLink(url);
      if (result.unknown) toast.success('Chưa thể xác minh liên kết lúc này. Hãy thận trọng trước khi mở.');
      else if (result.safe) toast.success('Không phát hiện liên kết nguy hiểm.');
      else toast.error(`Liên kết bị đánh dấu nguy hiểm: ${result.threatType || 'không xác định'}`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Không thể kiểm tra liên kết');
    } finally { setCheckingLink(false); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const hasText = !!content.trim();
    const hasFiles = selectedFiles.length > 0;
    
    if (!hasText && !hasFiles) return;
    if (isSending) return;

    try {
      setIsSending(true);

      const imagesToSend = selectedFiles.filter(item => item.isImage);
      const otherFilesToSend = selectedFiles.filter(item => !item.isImage);
      setSelectedFiles([]);

      // 1. Gửi toàn bộ ảnh trước — ChatWindow lo mã hóa/upload, ở đây chỉ đưa File thô và bắt lỗi từng ảnh.
      for (const item of imagesToSend) {
        try {
          await onSend(item.file, replyTo?._id, 'image', item.file.name, ttlSeconds);

          if (item.previewUrl) {
            URL.revokeObjectURL(item.previewUrl);
          }
        } catch (err) {
          console.error(`Lỗi khi gửi ảnh ${item.file.name}:`, err);
          toast.error(`Gửi ảnh ${item.file.name} thất bại.`);
        }
      }

      // 2. Gửi tin nhắn chữ tiếp theo (Có quét link bảo mật)
      if (hasText) {
        const trimmed = content.trim();

        if (trimmed.length > MAX_MESSAGE_LENGTH) {
          toast.error(`Tin nhắn không được vượt quá ${MAX_MESSAGE_LENGTH} ký tự`);
          setIsSending(false);
          return;
        }

        const scanResult = scanLinksInText(trimmed);

        if (scanResult.hasWarning) {
          const warningMsg = scanResult.warnings.map(w => w.message).join('\n');
          const confirmSend = await confirm(
            'Cảnh báo an toàn liên kết',
            `${warningMsg}\n\nBạn có chắc chắn vẫn muốn gửi tin nhắn này không?`,
            { confirmLabel: 'Vẫn gửi', cancelLabel: 'Hủy gửi' }
          );
          if (!confirmSend) {
            setIsSending(false);
            return;
          }
        }

        await onSend(trimmed, replyTo?._id, 'text', null, ttlSeconds);
        setContent('');
      }

      // 3. Gửi các file khác cuối cùng — giống hệt luồng ảnh/audio.
      for (const item of otherFilesToSend) {
        try {
          await onSend(item.file, replyTo?._id, 'file', item.file.name, ttlSeconds);

          if (item.previewUrl) {
            URL.revokeObjectURL(item.previewUrl);
          }
        } catch (err) {
          console.error(`Lỗi khi gửi file ${item.file.name}:`, err);
          toast.error(`Gửi tệp ${item.file.name} thất bại.`);
        }
      }

      isTypingRef.current = false;
      onTyping(false);
      clearTimeout(typingTimeout.current);
    } catch (err) {
      console.error('Lỗi khi gửi:', err);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e) => {
    handleKeyDownContent(e);
    if (e.key === 'Enter' && !e.shiftKey) {
      handleSubmit(e);
    }
  };

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // Dọn dẹp preview file khi unmount component (bộ đếm ghi âm tự dọn trong useVoiceRecorder)
  useEffect(() => {
    return () => {
      selectedFilesRef.current.forEach(item => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      });
    };
  }, []);

  return (
    <div
      className="px-4 py-3 bg-base-100 flex flex-col gap-1 border-t border-base-200 relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDraggingFile && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-primary/10 border-2 border-dashed border-primary rounded-t-2xl pointer-events-none">
          <span className="text-sm font-semibold text-primary">Thả tệp vào đây để đính kèm</span>
        </div>
      )}

      {replyTo && (
        <div className="flex justify-between items-center bg-base-200 border-l-2 border-primary rounded-lg px-3.5 py-1.5 text-xs shadow-xs mb-1">
          <span className="flex items-center gap-1">
            <HugeiconsIcon icon={ReplyIcon} size={14} strokeWidth={1.8} />
            Đang trả lời <strong className="font-bold text-primary">@{replyTo.sender.nickname || replyTo.sender.username}</strong>
          </span>
          <Button onClick={onCancelReply} size="xs" className="bg-base-300 gap-1"><HugeiconsIcon icon={Cancel01Icon} size={13} strokeWidth={1.8} />Hủy</Button>
        </div>
      )}

      {/* Danh sách tệp đính kèm chờ gửi */}
      {selectedFiles.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2 px-1 max-h-32 overflow-y-auto hide-scrollbar">
          {selectedFiles.map(item => (
            <div key={item.id} className="relative flex items-center bg-base-200 border border-base-300 rounded-lg p-1.5 max-w-[180px] shadow-3xs">
              {item.isImage ? (
                <img
                  src={item.previewUrl}
                  alt="preview"
                  className="w-10 h-10 rounded-md object-cover"
                />
              ) : (
                <div className="w-10 h-10 rounded-md bg-base-300 flex items-center justify-center text-base-content/60">
                  <HugeiconsIcon icon={File01Icon} size={20} strokeWidth={1.8} />
                </div>
              )}
              <div className="ml-2 flex-1 min-w-0 pr-4">
                <p className="text-[11px] font-semibold truncate">{item.file.name}</p>
                <p className="text-[9px] text-base-content/40">{(item.file.size / 1024).toFixed(1)} KB</p>
              </div>
              <button
                type="button"
                onClick={() => removeSelectedFile(item.id)}
                className="btn btn-circle btn-error text-white absolute -top-1.5 -right-1.5 w-4.5 h-4.5 min-h-0 h-4.5 text-[10px]"
                title="Xóa"
              >
                <HugeiconsIcon icon={Cancel01Icon} size={12} strokeWidth={1.8} />
              </button>
            </div>
          ))}
        </div>
      )}

      {isRecording ? (
        // Giao diện khi đang ghi âm
        <div className="flex items-center justify-between bg-error/10 border border-error/30 rounded-full px-4 py-2 text-error font-semibold animate-pulse">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-error animate-ping" />
            <span className="text-sm">Đang ghi âm...</span>
            <span className="badge badge-error badge-outline ml-2 font-mono">{formatTime(recordingTime)}</span>
          </div>

          <div className="flex items-center gap-3">
            <Button
              type="button"
              onClick={cancelRecording}
              size="sm" pill className="bg-base-100 gap-1.5"
              title="Hủy ghi âm"
            >
              <Trash2 className="w-3.5 h-3.5" /> Hủy
            </Button>

            <Button
              type="button"
              onClick={stopAndSendRecording}
              variant="error" size="sm" pill className="gap-1.5"
              disabled={isUploading}
            >
              {isUploading ? 'Đang gửi...' : (<><Send className="w-3.5 h-3.5" /> Gửi</>)}
            </Button>
          </div>
        </div>
      ) : (
        // Giao diện bình thường
        <form onSubmit={handleSubmit} className="join relative w-full items-end bg-base-200 rounded-full px-4 py-2">
          <div className="fab !absolute !bottom-2 !left-4 !right-auto !items-start z-20">
            <div tabIndex={0} role="button" aria-label="Thêm chức năng" className="btn btn-sm btn-circle btn-primary" title="Thêm chức năng">
              <Plus className="w-4 h-4" />
            </div>
            <div className="fab-close !left-0 !right-auto !flex-row-reverse text-xs font-medium">
              Đóng <span className="btn btn-sm btn-circle btn-error"><HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={1.8} /></span>
            </div>
            <div className="!flex-row-reverse">
              Đính kèm
              <Button type="button" onClick={() => fileInputRef.current?.click()} size="sm" circle className="hover:!text-primary" disabled={isSending} title="Đính kèm ảnh/tệp tin">
                <Paperclip className="w-4 h-4" />
              </Button>
            </div>
            <div className="!flex-row-reverse">
              Ghi âm
              <Button type="button" onClick={() => { if (dictation.isListening) dictation.stop(); startRecording(); }} size="sm" circle className="hover:!text-primary" title="Ghi âm thoại">
                <Mic className="w-4 h-4" />
              </Button>
            </div>
            {dictation.isSupported && (
              <div className="!flex-row-reverse">
                Đọc thành chữ
                <Button type="button" onClick={handleToggleDictation} variant={dictation.isListening ? 'primary' : 'ghost'} size="sm" circle className={dictation.isListening ? 'animate-pulse' : 'hover:!text-primary'} title={dictation.isListening ? 'Đang nghe — bấm để dừng' : 'Đọc thành chữ'}>
                  <Pencil className="w-4 h-4" />
                </Button>
              </div>
            )}
            <div className="relative !flex-row-reverse">
              Tin nhắn tự hủy
              <Button type="button" onClick={() => setShowTtlMenu(value => !value)} size="sm" circle className={ttlSeconds ? '!text-primary bg-primary/10' : 'hover:!text-primary'} title={ttlSeconds ? `Tin nhắn tự hủy sau ${TTL_OPTIONS.find(o => o.value === ttlSeconds)?.label}` : 'Tin nhắn tự hủy'}>
                <Timer className="w-4 h-4" />
              </Button>
              {showTtlMenu && (
                <ul className="absolute bottom-full mb-2 left-0 right-auto menu menu-sm bg-base-100 border border-base-300 rounded-xl shadow-lg w-36 p-1 z-30">
                  {TTL_OPTIONS.map(opt => (
                    <li key={opt.label}>
                      <a onClick={() => handlePickTtl(opt.value)} className={ttlSeconds === opt.value ? 'active font-semibold' : ''}>{opt.label}</a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            className="hidden"
            multiple
          />

          <textarea
            ref={messageInputRef}
            rows={1}
            className="textarea textarea-ghost min-h-0 h-9 max-h-[calc(100cqh/3)] flex-1 w-full resize-none bg-transparent py-2 pl-10 text-sm leading-5 focus:outline-none"
            value={content}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            maxLength={MAX_MESSAGE_LENGTH}
            placeholder="            Nhập tin nhắn... (Nhấn Enter để gửi)"
            autoFocus
            disabled={isSending}
          />

          <Button
            type="submit"
            variant={(content.trim() || selectedFiles.length > 0) && !isSending ? 'primary' : undefined}
            size="sm" circle className={`ml-2 ${(content.trim() || selectedFiles.length > 0) && !isSending ? '' : 'btn-disabled bg-base-300 text-base-content/30'}`}
            disabled={(!content.trim() && selectedFiles.length === 0) || isSending}
            title="Gửi"
          >
            <Send className="w-3.5 h-3.5" />
          </Button>
        </form>
      )}

      {scanLinksInText(content).urls[0] && !isRecording && (
        <button type="button" className="link link-primary text-xs self-start ml-4" onClick={handleCheckLink} disabled={checkingLink}>
          {checkingLink ? 'Đang kiểm tra liên kết...' : 'Kiểm tra liên kết bằng Safe Browsing'}
        </button>
      )}

      {confirmModal}
    </div>
  );
}
