import { pipeline } from '@huggingface/transformers';

// Import trong Worker (không phải bundle chính) — model (~150MB) + ONNX chỉ tải khi Worker thật sự tạo.

let transcriberPromise = null;
function getTranscriber() {
  if (!transcriberPromise) {
    transcriberPromise = pipeline('automatic-speech-recognition', 'Xenova/whisper-base');
  }
  return transcriberPromise;
}

self.onmessage = async (event) => {
  const { id, audioData } = event.data;
  try {
    const transcriber = await getTranscriber();
    const result = await transcriber(audioData, { language: 'vietnamese', task: 'transcribe' });
    self.postMessage({ id, type: 'result', text: result.text });
  } catch (err) {
    self.postMessage({ id, type: 'error', message: err.message });
  }
};
