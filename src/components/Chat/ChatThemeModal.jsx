import { useState } from 'react';
import Modal from '../common/Modal';
import ChatBackgroundPicker from './ChatBackgroundPicker';
import ChatMessageColorPicker from './ChatMessageColorPicker';

// View chủ đề chung: chỉ chọn tab, phần nền/màu chữ nằm ở component riêng.
export default function ChatThemeModal(props) {
  const [activeTab, setActiveTab] = useState('background');

  return (
    <Modal onClose={props.onClose} boxClassName="max-w-sm bg-base-100 border border-base-300 shadow-2xl">
      <h3 className="text-base font-bold mb-3">Đổi chủ đề</h3>
      <div className="tabs tabs-boxed tabs-sm mb-4 w-full">
        <button type="button" onClick={() => setActiveTab('background')} className={`tab flex-1 ${activeTab === 'background' ? 'tab-active' : ''}`}>Nền</button>
        <button type="button" onClick={() => setActiveTab('messages')} className={`tab flex-1 ${activeTab === 'messages' ? 'tab-active' : ''}`}>Tin nhắn</button>
      </div>
      {activeTab === 'background'
        ? <ChatBackgroundPicker {...props} />
        : <ChatMessageColorPicker {...props} />}
    </Modal>
  );
}
