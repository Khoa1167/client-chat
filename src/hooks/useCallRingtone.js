import { useEffect } from 'react';

// Chuông đổ cho ringing-out/ringing-in — tự sinh bằng Web Audio API, không cần file audio.
export default function useCallRingtone(callState) {
  useEffect(() => {
    if (callState !== 'ringing-out' && callState !== 'ringing-in') return;

    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    audioCtx.resume().catch(() => {});
    let stopped = false;
    let timeoutId;

    // ringing-out: tút... (nghỉ dài) | ringing-in: chuông dồn dập 2 tông, lặp liên tục
    const pattern = callState === 'ringing-out'
      ? { freqs: [425], beepMs: 1000, gapMs: 3000 }
      : { freqs: [800, 1000], beepMs: 400, gapMs: 400 };

    const beep = () => {
      if (stopped) return;
      pattern.freqs.forEach(freq => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.frequency.value = freq;
        gain.gain.value = 0.15;
        osc.connect(gain).connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + pattern.beepMs / 1000);
      });
      timeoutId = setTimeout(beep, pattern.beepMs + pattern.gapMs);
    };
    beep();

    return () => {
      stopped = true;
      clearTimeout(timeoutId);
      audioCtx.close();
    };
  }, [callState]);
}
