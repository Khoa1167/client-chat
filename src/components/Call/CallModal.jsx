import { useEffect, useRef } from 'react';
import useCallRingtone from '../../hooks/useCallRingtone';
import CallControls from './CallControls';
import CallMinimizedWidget from './CallMinimizedWidget';

const hiddenAudioVideoStyle = { position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' };

export default function CallModal({
  callState,
  callType,
  callerInfo,
  receiverInfo,
  localStream,
  remoteStream,
  isScreenSharing,
  isRemoteScreenSharing,
  onAccept,
  onDecline,
  onCancel,
  onEndCall,
  isMuted,
  isVideoOff,
  canSwitchCamera,
  facingMode,
  isSwitchingCamera,
  toggleMute,
  toggleCamera,
  switchCamera,
  toggleScreenShare,
  isMinimized,
  setIsMinimized
}) {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  useCallRingtone(callState);

  useEffect(() => {
    if (callState === 'active') {
      if (localVideoRef.current && localStream) {
        localVideoRef.current.srcObject = localStream;
        localVideoRef.current.muted = true;
      }
      if (remoteVideoRef.current && remoteStream) {
        remoteVideoRef.current.srcObject = remoteStream;
        remoteVideoRef.current.muted = false;
        const playPromise = remoteVideoRef.current.play();
        if (playPromise && typeof playPromise.catch === 'function') {
          playPromise.catch(() => {});
        }
      }
    }
  }, [callState, localStream, remoteStream]);

  if (callState === 'idle') return null;

  const partner = callState === 'ringing-in' ? callerInfo : receiverInfo;
  const partnerName = partner?.nickname || partner?.username || 'Người dùng';
  const partnerAvatar = partner?.avatar;

  if (isMinimized && callState === 'active') {
    return (
      <CallMinimizedWidget
        callType={callType}
        remoteStream={remoteStream}
        isRemoteScreenSharing={isRemoteScreenSharing}
        isVideoOff={isVideoOff}
        isScreenSharing={isScreenSharing}
        isMuted={isMuted}
        localVideoRef={localVideoRef}
        remoteVideoRef={remoteVideoRef}
        partnerName={partnerName}
        partnerAvatar={partnerAvatar}
        onEndCall={onEndCall}
        setIsMinimized={setIsMinimized}
      />
    );
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 transition-all duration-300">
      <div className="bg-neutral text-neutral-content w-full max-w-sm h-full max-h-[600px] md:rounded-3xl shadow-2xl flex flex-col overflow-hidden relative border border-white/10">

        {callState === 'active' && (
          <button
            onClick={() => setIsMinimized(true)}
            className="btn btn-circle btn-sm bg-black/40 hover:bg-black/60 border-none text-white absolute top-4 left-4 z-40"
            title="Thu nhỏ"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="4 14 10 14 10 20" />
              <polyline points="20 10 14 10 14 4" />
              <line x1="14" y1="10" x2="21" y2="3" />
              <line x1="10" y1="14" x2="3" y2="21" />
            </svg>
          </button>
        )}

        {/* Ringing Out (Đang gọi đi) */}
        {callState === 'ringing-out' && (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center animate-pulse">
            <div className="avatar mb-6">
              <div className="w-24 rounded-full bg-primary text-3xl font-bold shadow-xl ring-4 ring-primary/20">
                {partnerAvatar ? (
                  <img src={partnerAvatar} alt="avatar" />
                ) : (
                  <span className="w-full h-full flex items-center justify-center text-primary-content">{partnerName[0].toUpperCase()}</span>
                )}
              </div>
            </div>
            <h2 className="text-xl font-bold mb-2">{partnerName}</h2>
            <p className="text-sm text-neutral-content/50 mb-16">Đang đổ chuông...</p>

            <button onClick={onCancel} className="btn btn-circle btn-lg btn-error shadow-lg" title="Hủy cuộc gọi">
              <svg className="w-7 h-7 text-white rotate-[135deg]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.94.725l.548 2.2a1 1 0 01-.321.988l-1.305.98a10.582 10.582 0 004.872 4.872l.98-1.305a1 1 0 01.988-.321l2.2.548a1 1 0 01.725.94V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
            </button>
          </div>
        )}

        {/* Ringing In (Cuộc gọi đến) */}
        {callState === 'ringing-in' && (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
            <div className="avatar mb-6">
              <div className="w-24 rounded-full bg-primary text-3xl font-bold shadow-xl ring-4 ring-primary/20 animate-bounce">
                {partnerAvatar ? (
                  <img src={partnerAvatar} alt="avatar" />
                ) : (
                  <span className="w-full h-full flex items-center justify-center text-primary-content">{partnerName[0].toUpperCase()}</span>
                )}
              </div>
            </div>
            <h2 className="text-xl font-bold mb-2">{partnerName}</h2>
            <p className="text-sm text-primary mb-16 font-semibold animate-pulse">
              {callType === 'video' ? 'Cuộc gọi video đến...' : 'Cuộc gọi thoại đến...'}
            </p>

            <div className="flex items-center gap-10">
              <button onClick={onDecline} className="btn btn-circle btn-lg btn-error shadow-lg" title="Từ chối">
                <svg className="w-7 h-7 text-white rotate-[135deg]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.94.725l.548 2.2a1 1 0 01-.321.988l-1.305.98a10.582 10.582 0 004.872 4.872l.98-1.305a1 1 0 01.988-.321l2.2.548a1 1 0 01.725.94V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
              </button>

              <button onClick={onAccept} className="btn btn-circle btn-lg btn-success shadow-lg" title="Trả lời">
                <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.94.725l.548 2.2a1 1 0 01-.321.988l-1.305.98a10.582 10.582 0 004.872 4.872l.98-1.305a1 1 0 01.988-.321l2.2.548a1 1 0 01.725.94V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Active Call (Đang kết nối gọi điện) */}
        {callState === 'active' && (
          <div className="flex-1 flex flex-col relative h-full bg-black">

            {callType === 'video' ? (
              <div className="w-full h-full relative">
                {/* Video của đối phương (Khung chính) */}
                {remoteStream ? (
                  <video
                    ref={remoteVideoRef}
                    autoPlay
                    playsInline
                    className={`w-full h-full ${isRemoteScreenSharing ? 'object-contain' : 'object-cover'}`}
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-gray-500 bg-gray-900">
                    <span className="text-xl animate-pulse">Đang kết nối video...</span>
                  </div>
                )}

                {isRemoteScreenSharing && (
                  <div className="absolute top-4 right-4 rounded-full bg-black/70 px-3 py-1 text-xs font-medium text-white z-20">
                    Đang chia sẻ màn hình
                  </div>
                )}

                {/* Video của chính mình (Khung nhỏ) */}
                <div className="absolute bottom-20 right-4 w-24 h-32 rounded-lg overflow-hidden border border-white/20 shadow-xl z-20 bg-gray-950">
                  {isVideoOff && !isScreenSharing ? (
                    <div className="w-full h-full flex items-center justify-center text-gray-600 bg-black text-[10px] font-semibold">Tắt Cam</div>
                  ) : (
                    <video
                      ref={localVideoRef}
                      autoPlay
                      playsInline
                      muted
                      className={`w-full h-full ${isScreenSharing ? 'object-contain' : 'object-cover'}`}
                    />
                  )}
                </div>
              </div>
            ) : (
              // Audio Call (Khung giao diện thoại)
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center bg-neutral">
                <div className="avatar mb-4">
                  <div className="w-24 rounded-full bg-primary text-3xl font-bold shadow-xl ring-2 ring-primary/20">
                    {partnerAvatar ? (
                      <img src={partnerAvatar} alt="avatar" />
                    ) : (
                      <span className="w-full h-full flex items-center justify-center text-primary-content">{partnerName[0].toUpperCase()}</span>
                    )}
                  </div>
                </div>
                <h2 className="text-xl font-bold mb-2">{partnerName}</h2>
                <p className="text-sm text-success font-semibold animate-pulse">Cuộc gọi thoại đang kết nối...</p>

                {/* ponytail: không dùng class "hidden" (display:none) — mobile Safari/Chrome sẽ suspend audio track. Ẩn bằng kích thước 1px thay vì display:none. */}
                <video ref={localVideoRef} autoPlay playsInline muted style={hiddenAudioVideoStyle} />
                <video ref={remoteVideoRef} autoPlay playsInline style={hiddenAudioVideoStyle} />
              </div>
            )}

            <CallControls
              callType={callType}
              isMuted={isMuted}
              isVideoOff={isVideoOff}
              isScreenSharing={isScreenSharing}
              canSwitchCamera={canSwitchCamera}
              isSwitchingCamera={isSwitchingCamera}
              facingMode={facingMode}
              toggleMute={toggleMute}
              toggleCamera={toggleCamera}
              switchCamera={switchCamera}
              toggleScreenShare={toggleScreenShare}
              onEndCall={onEndCall}
            />
          </div>
        )}

      </div>
    </div>
  );
}
