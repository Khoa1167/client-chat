import { safeGet, safeSet } from './safeStorage';

const STORAGE_KEY = 'onDeviceTranscription';

export const isOnDeviceEnabled = () => safeGet(localStorage, STORAGE_KEY) === '1';

export const setOnDeviceEnabled = (enabled) => {
  safeSet(localStorage, STORAGE_KEY, enabled ? '1' : '0');
};

// 1 Worker dùng chung cho cả app (tạo lần đầu cần dùng) — tránh mỗi tin nhắn thoại tự spawn 1
// Worker + tải lại model riêng.
let worker = null;
let nextId = 0;
const pending = new Map();

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('../workers/onDeviceTranscribeWorker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (event) => {
      const { id, type, text, message } = event.data;
      const resolver = pending.get(id);
      if (!resolver) return;
      pending.delete(id);
      if (type === 'result') resolver.resolve(text);
      else resolver.reject(new Error(message));
    };
  }
  return worker;
}

// Whisper cần Float32Array mono 16kHz — decode + resample ở main thread (AudioContext không có trong Worker).
async function decodeToMono16k(blob) {
  const arrayBuffer = await blob.arrayBuffer();
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const decoded = await audioCtx.decodeAudioData(arrayBuffer);
  audioCtx.close();

  const offlineCtx = new OfflineAudioContext(1, Math.ceil(decoded.duration * 16000), 16000);
  const source = offlineCtx.createBufferSource();
  source.buffer = decoded;
  source.connect(offlineCtx.destination);
  source.start();
  const resampled = await offlineCtx.startRendering();
  return resampled.getChannelData(0);
}

export async function transcribeOnDevice(blob) {
  const audioData = await decodeToMono16k(blob);
  const id = nextId++;

  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ id, audioData }, [audioData.buffer]);
  });
}
