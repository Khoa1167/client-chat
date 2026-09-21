import { useEffect, useRef } from 'react';
import useDraggableWidget from '../../hooks/useDraggableWidget';
import useAudioLevel from '../../hooks/useAudioLevel';
import CallControls from './CallControls';

function VideoTile({ stream, muted, label, avatar, isScreenSharing }) {
  const videoRef = useRef(null);
  useEffect(() => {
    if (videoRef.current && stream) videoRef.current.srcObject = stream;
  }, [stream]);

  const hasVideo = stream?.getVideoTracks().some(t => t.enabled) ?? false;
  const isSpeaking = useAudioLevel(stream);

  return (
    <div className={`relative bg-gray-900 rounded-lg overflow-hidden aspect-video flex items-center justify-center transition-shadow ${isSpeaking ? 'ring-4 ring-success ring-inset' : ''}`}>
      {hasVideo ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={muted}
          className={`w-full h-full ${isScreenSharing ? 'object-contain' : 'object-cover'}`}
        />
      ) : (
        <div className="avatar placeholder">
          <div className="w-16 rounded-full bg-primary text-primary-content">
            {avatar ? (
              <img src={avatar} alt={label} />
            ) : (
              <span className="text-xl font-bold">{label?.[0]?.toUpperCase() || '?'}</span>
            )}
          </div>
        </div>
      )}
      <span className="absolute bottom-1 left-1 text-[11px] bg-black/60 text-white px-1.5 py-0.5 rounded">
        {label}{isScreenSharing ? ' (đang chia sẻ)' : ''}
      </span>
    </div>
  );
}

export default function GroupCallModal({
  callState,
  activeRoom,
  localStream,
  localUser,
  participants,
  roomMembers,
  isMuted,
  isVideoOff,
  isScreenSharing,
  isMinimized,
  setIsMinimized,
  onLeave,
  toggleMute,
  toggleCamera,
  toggleScreenShare,
}) {
  const { position, handleMouseDown, handleTouchStart } = useDraggableWidget({
    isMinimized, widthLimit: 160, heightLimit: 90,
  });

  if (callState === 'idle') return null;

  const participantList = Array.from(participants.values());
  const getAvatar = (userId) => roomMembers?.find(m => (m._id || m)?.toString() === userId)?.avatar;

  if (isMinimized) {
    return (
      <div
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        style={{ left: position.x, top: position.y }}
        className="fixed z-50 select-none cursor-move w-40 rounded-xl border-2 border-primary bg-neutral shadow-2xl px-3 py-2 flex items-center justify-between gap-2"
      >
        <span className="text-xs font-semibold truncate">Gọi nhóm ({participantList.length + 1})</span>
        <div className="flex gap-1 shrink-0">
          <button onClick={() => setIsMinimized(false)} className="btn btn-circle btn-xs bg-black/40 border-none text-white" title="Phóng to">
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" />
              <line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
            </svg>
          </button>
          <button onClick={onLeave} className="btn btn-circle btn-xs btn-error" title="Rời cuộc gọi">
            <svg className="w-3 h-3 text-white rotate-[135deg]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.94.725l.548 2.2a1 1 0 01-.321.988l-1.305.98a10.582 10.582 0 004.872 4.872l.98-1.305a1 1 0 01.988-.321l2.2.548a1 1 0 01.725.94V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  const gridCols = participantList.length + 1 <= 2 ? 'grid-cols-1' : participantList.length + 1 <= 4 ? 'grid-cols-2' : 'grid-cols-3';

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-50">
      <div className="bg-neutral text-neutral-content w-full h-full md:max-w-4xl md:max-h-[80vh] md:rounded-3xl shadow-2xl flex flex-col overflow-hidden relative border border-white/10">
        <button
          onClick={() => setIsMinimized(true)}
          className="btn btn-circle btn-sm bg-black/40 hover:bg-black/60 border-none text-white absolute top-4 left-4 z-40"
          title="Thu nhỏ"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="4 14 10 14 10 20" /><polyline points="20 10 14 10 14 4" />
            <line x1="14" y1="10" x2="21" y2="3" /><line x1="10" y1="14" x2="3" y2="21" />
          </svg>
        </button>

        <div className={`flex-1 grid ${gridCols} gap-2 p-4 pt-16 auto-rows-fr overflow-auto`}>
          <VideoTile stream={localStream} muted label="Bạn" avatar={localUser?.avatar} />
          {participantList.map(p => (
            <VideoTile
              key={p.userId}
              stream={p.stream}
              label={p.username || 'Người dùng'}
              avatar={getAvatar(p.userId)}
              isScreenSharing={p.isScreenSharing}
            />
          ))}
        </div>

        <CallControls
          callType={activeRoom?.callType}
          isMuted={isMuted}
          isVideoOff={isVideoOff}
          isScreenSharing={isScreenSharing}
          canSwitchCamera={false}
          isSwitchingCamera={false}
          toggleMute={toggleMute}
          toggleCamera={toggleCamera}
          toggleScreenShare={toggleScreenShare}
          onEndCall={onLeave}
        />
      </div>
    </div>
  );
}
