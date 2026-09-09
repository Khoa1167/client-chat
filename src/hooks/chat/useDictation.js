import { useRef, useState } from 'react';

const SpeechRecognitionCtor = typeof window !== 'undefined'
  ? (window.SpeechRecognition || window.webkitSpeechRecognition)
  : null;

// Web Speech API built-in — Chrome thực ra gửi audio lên server Google để nhận diện (không hoàn
// toàn on-device), nhưng 0 byte qua server app này; tin gửi đi vẫn E2EE bình thường.
export default function useDictation({ onResult }) {
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef(null);

  const start = () => {
    if (!SpeechRecognitionCtor || recognitionRef.current) return;

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = 'vi-VN';
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let transcript = '';
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      onResult(transcript);
    };
    recognition.onerror = () => {
      recognitionRef.current = null;
      setIsListening(false);
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setIsListening(false);
    };

    recognition.start();
    recognitionRef.current = recognition;
    setIsListening(true);
  };

  const stop = () => {
    recognitionRef.current?.stop();
  };

  return { isListening, isSupported: !!SpeechRecognitionCtor, start, stop };
}
