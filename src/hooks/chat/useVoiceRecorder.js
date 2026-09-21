import { useEffect, useRef, useState } from 'react';

// Phải khớp với giới hạn multer route upload-audio ở server (server/src/routes/rooms.js) — chỉ
// để chặn sớm ở client cho UX tốt hơn, server vẫn là nơi enforce thật.
const MAX_AUDIO_SIZE = 10 * 1024 * 1024;

// Ghi âm tin nhắn thoại bằng MediaRecorder, tách khỏi MessageInput — chỉ cần onSend (mã hóa+upload do ChatWindow lo) và onError.
export default function useVoiceRecorder({ onSend, replyTo, ttlSeconds, onError }) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);

  // Dọn bộ đếm khi unmount (vd chuyển phòng giữa lúc đang ghi âm)
  useEffect(() => {
    return () => clearInterval(timerRef.current);
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];

      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
        .find(type => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        // Voice note ưu tiên dung lượng vừa phải; audio đã được codec nén, không gzip lại.
        audioBitsPerSecond: 48000,
      });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.start(10); // Lấy data mỗi 10ms

      setIsRecording(true);
      setRecordingTime(0);

      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

    } catch (err) {
      console.error('Không thể truy cập Microphone:', err);
      onError('Không thể truy cập microphone. Vui lòng kiểm tra quyền thiết bị.');
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current) {
      // Dừng track âm thanh để tắt mic của thiết bị
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
    clearInterval(timerRef.current);
    setIsRecording(false);
    setRecordingTime(0);
    audioChunksRef.current = [];
  };

  const stopAndSendRecording = () => {
    if (!mediaRecorderRef.current) return;

    const recorder = mediaRecorderRef.current;

    recorder.onstop = async () => {
      try {
        const audioBlob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });

        if (audioBlob.size > MAX_AUDIO_SIZE) {
          onError('Tin nhắn thoại không được vượt quá 10MB');
          return;
        }

        setIsUploading(true);

        // Mã hóa E2EE + upload ciphertext do ChatWindow đảm nhận (cần đúng session/sender key
        // của phòng) — giống luồng ảnh, hook chỉ đưa Blob thô cho onSend.
        await onSend(audioBlob, replyTo?._id, 'audio', `voice-note.${audioBlob.type.includes('mp4') ? 'm4a' : 'webm'}`, ttlSeconds);

      } catch (err) {
        console.error('Lỗi khi tải tệp âm thanh lên:', err);
        onError('Gửi tin nhắn thoại thất bại. Vui lòng thử lại.');
      } finally {
        setIsUploading(false);
      }
    };

    // Dừng recorder (kích hoạt sự kiện onstop)
    recorder.stop();
    recorder.stream.getTracks().forEach(track => track.stop());
    clearInterval(timerRef.current);
    setIsRecording(false);
    setRecordingTime(0);
  };

  return { isRecording, recordingTime, isUploading, startRecording, cancelRecording, stopAndSendRecording };
}
