import { useEffect, useState } from 'react';

const SPEAKING_HANGOVER_MS = 300; // giữ true thêm 1 nhịp ngắn giữa các âm tiết, tránh nháy liên tục

// Trả về true/false theo mức âm lượng của audio track trong stream — dùng cho hiệu ứng "đang nói".
// Track audio của participant được add vào stream SAU khi mount (consume audio/video tách rời,
// stream là cùng 1 object bị mutate qua addTrack, không đổi reference) nên phải nghe sự kiện
// addtrack/removetrack của chính MediaStream thay vì chỉ đọc getAudioTracks() một lần khi effect chạy.
export default function useAudioLevel(stream, threshold = 0.05) {
  const [isSpeaking, setIsSpeaking] = useState(false);

  useEffect(() => {
    if (!stream) {
      // queueMicrotask: tránh setState đồng bộ ngay trong thân effect (React lint chặn vì có thể
      // gây render dồn dập) — chỉ áp dụng cho nhánh reset về false, còn cập nhật thật khi có âm
      // thanh vẫn chạy trong callback rAF của poll() bên dưới.
      queueMicrotask(() => setIsSpeaking(false));
      return;
    }

    let audioCtx = null;
    let source = null;
    let analyser = null;
    let rafId = null;
    let hangoverTimer = null;
    let currentTrack = null;
    let cancelled = false;

    const teardown = () => {
      if (rafId) cancelAnimationFrame(rafId);
      if (hangoverTimer) clearTimeout(hangoverTimer);
      source?.disconnect();
      analyser?.disconnect();
      audioCtx?.close();
      audioCtx = source = analyser = rafId = hangoverTimer = currentTrack = null;
    };

    const attach = (track) => {
      teardown();
      currentTrack = track || null;
      if (!track) {
        queueMicrotask(() => setIsSpeaking(false));
        return;
      }

      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      source = audioCtx.createMediaStreamSource(new MediaStream([track]));
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);

      const poll = () => {
        if (cancelled) return;
        analyser.getByteTimeDomainData(data);
        let sumSquares = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sumSquares += v * v;
        }
        const rms = Math.sqrt(sumSquares / data.length);

        if (rms > threshold) {
          if (hangoverTimer) { clearTimeout(hangoverTimer); hangoverTimer = null; }
          setIsSpeaking(true);
        } else if (!hangoverTimer) {
          hangoverTimer = setTimeout(() => { setIsSpeaking(false); hangoverTimer = null; }, SPEAKING_HANGOVER_MS);
        }
        rafId = requestAnimationFrame(poll);
      };
      poll();
    };

    attach(stream.getAudioTracks()[0]);
    const onAddTrack = (e) => { if (e.track.kind === 'audio' && !currentTrack) attach(e.track); };
    const onRemoveTrack = (e) => { if (e.track === currentTrack) attach(stream.getAudioTracks()[0]); };
    stream.addEventListener('addtrack', onAddTrack);
    stream.addEventListener('removetrack', onRemoveTrack);

    return () => {
      cancelled = true;
      stream.removeEventListener('addtrack', onAddTrack);
      stream.removeEventListener('removetrack', onRemoveTrack);
      teardown();
    };
  }, [stream, threshold]);

  return isSpeaking;
}
