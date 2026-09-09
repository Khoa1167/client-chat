import { useState } from 'react';
import Modal from '../common/Modal';
import Button from '../common/Button';

export default function PollModal({ onClose, onCreate }) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [error, setError] = useState('');

  const updateOption = (index, value) => {
    setOptions(prev => prev.map((option, i) => i === index ? value : option));
  };

  const submit = (event) => {
    event.preventDefault();
    const cleanQuestion = question.trim();
    const cleanOptions = options.map(option => option.trim()).filter(Boolean);
    if (!cleanQuestion || cleanOptions.length < 2) {
      setError('Nhập câu hỏi và ít nhất hai lựa chọn.');
      return;
    }
    onCreate({ question: cleanQuestion, options: cleanOptions });
  };

  return (
    <Modal onClose={onClose} boxClassName="w-full max-w-md p-5">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <h3 className="font-bold text-lg">Tạo khảo sát</h3>
        <textarea
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          className="textarea textarea-bordered w-full resize-none"
          placeholder="Câu hỏi"
          maxLength={500}
          rows={2}
          autoFocus
        />
        {options.map((option, index) => (
          <input
            key={index}
            value={option}
            onChange={(event) => updateOption(index, event.target.value)}
            className="input input-bordered w-full"
            placeholder={`Lựa chọn ${index + 1}`}
            maxLength={300}
          />
        ))}
        {options.length < 5 && (
          <button type="button" onClick={() => setOptions(prev => [...prev, ''])} className="text-sm text-primary font-semibold text-left w-fit">
            + Thêm lựa chọn
          </button>
        )}
        {error && <p className="text-xs text-error">{error}</p>}
        <div className="flex justify-end gap-2 mt-1">
          <Button type="button" onClick={onClose}>Hủy</Button>
          <Button type="submit" variant="primary">Tạo khảo sát</Button>
        </div>
      </form>
    </Modal>
  );
}
