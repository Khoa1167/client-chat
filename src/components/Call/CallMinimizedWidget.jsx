import useDraggableWidget from '../../hooks/useDraggableWidget';

const hiddenAudioVideoStyle = { position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' };

// localVideoRef/remoteVideoRef nhận từ component cha (không tự tạo) — cha đã set srcObject vào
// 2 ref này, cần đúng ref đó gắn vào phần tử <video> đang thật sự render ở đây.
export default function CallMinimizedWidget({
  callType,
  remoteStream,
  isRemoteScreenSharing,
  isVideoOff,
  isScreenSharing,
  isMuted,
  localVideoRef,
  remoteVideoRef,
  partnerName,
  partnerAvatar,
  onEndCall,
  setIsMinimized,
}) {
  const widthLimit = callType === 'video' ? 160 : 110;
  const heightLimit = callType === 'video' ? 220 : 120;
  const { position, handleMouseDown, handleTouchStart } = useDraggableWidget({
    isMinimized: true, widthLimit, heightLimit,
  });

  return (
    <div
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
      style={{ left: position.x, top: position.y }}
      className={`fixed z-50 select-none cursor-move transition-transform active:scale-95 duration-75 ${
        callType === 'video'
          ? 'w-[140px] h-[190px] rounded-2xl border-2 border-primary bg-black shadow-2xl overflow-hidden flex flex-col'
          : 'w-[90px] h-[90px] rounded-full border-2 border-primary bg-neutral shadow-2xl flex flex-col items-center justify-center'
      }`}
    >
      {callType === 'video' ? (
        <div className="w-full h-full relative group">
          {remoteStream ? (
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className={`w-full h-full pointer-events-none ${isRemoteScreenSharing ? 'object-contain' : 'object-cover'}`}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gray-900 text-[10px]">Kết nối...</div>
          )}

          <div className="absolute top-1.5 right-1.5 w-8 h-12 rounded border border-white/20 overflow-hidden z-10 bg-black">
            {isVideoOff && !isScreenSharing ? (
              <div className="w-full h-full bg-black flex items-center justify-center text-[7px] text-gray-500">Tắt</div>
            ) : (
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full pointer-events-none ${isScreenSharing ? 'object-contain' : 'object-cover'}`}
              />
            )}
          </div>

          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-2 z-20">
            <div className="flex justify-between items-center w-full">
              <button
                onClick={() => setIsMinimized(false)}
                className="btn btn-circle btn-xs bg-black/60 hover:bg-black/80 border-none text-white"
                title="Phóng to"
              >
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 3 21 3 21 9" />
                  <polyline points="9 21 3 21 3 15" />
                  <line x1="21" y1="3" x2="14" y2="10" />
                  <line x1="3" y1="21" x2="10" y2="14" />
                </svg>
              </button>
              <span className="text-[10px]">🎙️</span>
            </div>

            <button onClick={onEndCall} className="btn btn-circle btn-sm btn-error mx-auto shadow-md" title="Gác máy">
              <svg className="w-4 h-4 text-white rotate-[135deg]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.94.725l.548 2.2a1 1 0 01-.321.988l-1.305.98a10.582 10.582 0 004.872 4.872l.98-1.305a1 1 0 01.988-.321l2.2.548a1 1 0 01.725.94V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
            </button>
          </div>
        </div>
      ) : (
        <div className="w-full h-full relative group flex items-center justify-center">
          <div className="absolute inset-0 rounded-full animate-ping bg-primary/10 z-0" />

          <div className="avatar z-10">
            <div className="w-14 rounded-full bg-primary border border-primary/60">
              {partnerAvatar ? (
                <img src={partnerAvatar} alt="avatar" />
              ) : (
                <span className="w-full h-full flex items-center justify-center text-sm font-bold text-primary-content">
                  {partnerName[0].toUpperCase()}
                </span>
              )}
            </div>
          </div>

          {/* ponytail: không dùng class "hidden" (display:none) — mobile Safari/Chrome sẽ suspend audio track. Ẩn bằng kích thước 1px thay vì display:none. */}
          <video ref={localVideoRef} autoPlay playsInline muted style={hiddenAudioVideoStyle} />
          <video ref={remoteVideoRef} autoPlay playsInline style={hiddenAudioVideoStyle} />

          <div className="absolute inset-0 rounded-full bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-center items-center gap-1 z-20">
            <div className="flex gap-2">
              <button
                onClick={() => setIsMinimized(false)}
                className="btn btn-circle btn-xs bg-black/80 hover:bg-black border-none text-white"
                title="Phóng to"
              >
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 3 21 3 21 9" />
                  <polyline points="9 21 3 21 3 15" />
                  <line x1="21" y1="3" x2="14" y2="10" />
                  <line x1="3" y1="21" x2="10" y2="14" />
                </svg>
              </button>
              <button onClick={onEndCall} className="btn btn-circle btn-xs btn-error" title="Gác máy">
                <svg className="w-3.5 h-3.5 text-white rotate-[135deg]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.94.725l.548 2.2a1 1 0 01-.321.988l-1.305.98a10.582 10.582 0 004.872 4.872l.98-1.305a1 1 0 01.988-.321l2.2.548a1 1 0 01.725.94V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
              </button>
            </div>
            <span className="text-[8px] font-semibold">{isMuted ? 'Mute' : 'Mic On'}</span>
          </div>
        </div>
      )}
    </div>
  );
}
