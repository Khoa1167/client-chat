import { HugeiconsIcon } from '@hugeicons/react';
import { ScreenShareIcon, ScreenShareOffIcon, SwitchCameraIcon } from '@hugeicons/core-free-icons';

// onEndCall là "gác máy" hay "rời cuộc gọi" tùy nơi truyền vào — component không tự phân biệt.
export default function CallControls({
  callType,
  isMuted,
  isVideoOff,
  isScreenSharing,
  canSwitchCamera,
  isSwitchingCamera,
  facingMode,
  toggleMute,
  toggleCamera,
  switchCamera,
  toggleScreenShare,
  onEndCall,
}) {
  return (
    <div className="absolute bottom-4 left-0 right-0 flex justify-center items-center gap-2 sm:gap-4 z-40 bg-gradient-to-t from-black/60 to-transparent py-4 px-2">
      <button
        onClick={toggleMute}
        className={`btn btn-circle ${isMuted ? 'btn-error' : 'bg-white/10 hover:bg-white/20 border-white/10 text-white'}`}
        title={isMuted ? 'Bật Mic' : 'Tắt Mic'}
      >
        🎙️
      </button>

      {callType === 'video' && (
        <button
          onClick={toggleCamera}
          disabled={isScreenSharing}
          className={`btn btn-circle ${isVideoOff ? 'btn-error' : 'bg-white/10 hover:bg-white/20 border-white/10 text-white'}`}
          title={isScreenSharing ? 'Dừng chia sẻ màn hình để điều khiển camera' : isVideoOff ? 'Bật Camera' : 'Tắt Camera'}
        >
          📹
        </button>
      )}

      {callType === 'video' && canSwitchCamera && (
        <button
          onClick={switchCamera}
          disabled={isScreenSharing || isSwitchingCamera}
          className="btn btn-circle bg-white/10 hover:bg-white/20 border-white/10 text-white"
          title={isScreenSharing
            ? 'Dừng chia sẻ màn hình để chuyển camera'
            : facingMode === 'user' ? 'Chuyển sang camera sau' : 'Chuyển sang camera trước'}
          aria-label={facingMode === 'user' ? 'Chuyển sang camera sau' : 'Chuyển sang camera trước'}
        >
          <HugeiconsIcon icon={SwitchCameraIcon} size={22} strokeWidth={1.8} />
        </button>
      )}

      {callType === 'video' && (
        <button
          onClick={toggleScreenShare}
          className={`btn btn-circle ${isScreenSharing ? 'btn-primary' : 'bg-white/10 hover:bg-white/20 border-white/10 text-white'}`}
          title={isScreenSharing ? 'Dừng chia sẻ màn hình' : 'Chia sẻ màn hình'}
          aria-label={isScreenSharing ? 'Dừng chia sẻ màn hình' : 'Chia sẻ màn hình'}
          aria-pressed={isScreenSharing}
        >
          <HugeiconsIcon icon={isScreenSharing ? ScreenShareOffIcon : ScreenShareIcon} size={22} strokeWidth={1.8} />
        </button>
      )}

      <button onClick={onEndCall} className="btn btn-circle btn-error shadow-lg" title="Gác máy">
        <svg className="w-5 h-5 text-white rotate-[135deg]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.94.725l.548 2.2a1 1 0 01-.321.988l-1.305.98a10.582 10.582 0 004.872 4.872l.98-1.305a1 1 0 01.988-.321l2.2.548a1 1 0 01.725.94V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
        </svg>
      </button>
    </div>
  );
}
