/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import CallModal from '../components/Call/CallModal';
import { toast } from '../components/common/toastStore';
import { useSocket } from '../hooks/useSocket';
import { getCallIceServers } from '../api/auth.api';
import { flushIceCandidateQueue } from '../utils/iceCandidateQueue';
import { replaceOutgoingVideoTrack } from '../utils/screenShare';

const CallContext = createContext(null);

export function CallProvider({ children }) {
  const { on, emit } = useSocket();
  const [callState, setCallState] = useState('idle');
  const [callType, setCallType] = useState('video');
  const [callerInfo, setCallerInfo] = useState(null);
  const [receiverInfo, setReceiverInfo] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const [screenStream, setScreenStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [isRemoteScreenSharing, setIsRemoteScreenSharing] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [canSwitchCamera, setCanSwitchCamera] = useState(false);
  const [facingMode, setFacingMode] = useState('user');
  const [isSwitchingCamera, setIsSwitchingCamera] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const cameraSwitchingRef = useRef(false);
  const cameraSwitchRequestRef = useRef(0);
  const targetUserIdRef = useRef(null);
  const pendingIceRef = useRef([]);

  const disposeCall = useCallback(() => {
    screenStreamRef.current?.getTracks().forEach(track => track.stop());
    screenStreamRef.current = null;
    cameraSwitchRequestRef.current += 1;
    cameraSwitchingRef.current = false;
    localStreamRef.current?.getTracks().forEach(track => track.stop());
    localStreamRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    targetUserIdRef.current = null;
    pendingIceRef.current = [];
  }, []);

  const cleanupCall = useCallback(() => {
    setCallState('idle');
    setCallerInfo(null);
    setReceiverInfo(null);
    setLocalStream(null);
    setScreenStream(null);
    setRemoteStream(null);
    setIsRemoteScreenSharing(false);
    setIsMuted(false);
    setIsVideoOff(false);
    setCanSwitchCamera(false);
    setFacingMode('user');
    setIsSwitchingCamera(false);
    setIsMinimized(false);
    disposeCall();
  }, [disposeCall]);

  const initiatePeerConnection = useCallback((targetId, iceServers) => {
    const pc = new RTCPeerConnection({ iceServers });
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) emit('call:ice-candidate', { targetId, candidate });
    };
    pc.ontrack = ({ streams }) => {
      if (streams[0]) setRemoteStream(streams[0]);
    };
    pcRef.current = pc;
    return pc;
  }, [emit]);

  const flushPendingIce = useCallback(async (pc) => {
    const candidates = pendingIceRef.current;
    pendingIceRef.current = [];
    if (!candidates.length) return;

    await flushIceCandidateQueue({
      queue: candidates,
      onCandidate: async (candidate) => {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      },
    });
  }, []);

  const detectSwitchableCamera = useCallback(async (stream) => {
    try {
      const supportsFacingMode = navigator.mediaDevices.getSupportedConstraints?.().facingMode;
      const devices = supportsFacingMode ? await navigator.mediaDevices.enumerateDevices() : [];
      if (localStreamRef.current === stream) {
        setCanSwitchCamera(devices.filter(({ kind }) => kind === 'videoinput').length > 1);
      }
    } catch {
      if (localStreamRef.current === stream) setCanSwitchCamera(false);
    }
  }, []);

  const startCall = useCallback(async (partner, type) => {
    try {
      setCallState('ringing-out');
      setCallType(type);
      setReceiverInfo(partner);
      targetUserIdRef.current = partner._id;
      setIsMuted(false);
      setIsVideoOff(false);
      setCanSwitchCamera(false);
      setFacingMode('user');
      const [iceServers, stream] = await Promise.all([
        getCallIceServers(),
        navigator.mediaDevices.getUserMedia({
          video: type === 'video' ? { facingMode: { ideal: 'user' } } : false,
          audio: true,
        }),
      ]);
      setLocalStream(stream);
      localStreamRef.current = stream;
      if (type === 'video') {
        setFacingMode(stream.getVideoTracks()[0]?.getSettings().facingMode === 'environment' ? 'environment' : 'user');
        void detectSwitchableCamera(stream);
      }
      const pc = initiatePeerConnection(partner._id, iceServers);
      stream.getTracks().forEach(track => pc.addTrack(track, stream));
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      emit('call:request', { receiverId: partner._id, signalData: offer, type });
    } catch (error) {
      console.error('Không thể bắt đầu cuộc gọi:', error);
      toast.error('Không thể truy cập camera hoặc microphone.');
      cleanupCall();
    }
  }, [cleanupCall, detectSwitchableCamera, emit, initiatePeerConnection]);

  const acceptCall = useCallback(async () => {
    if (!callerInfo) return;
    try {
      setCallState('active');
      const partnerId = callerInfo._id;
      targetUserIdRef.current = partnerId;
      const [iceServers, stream] = await Promise.all([
        getCallIceServers(),
        navigator.mediaDevices.getUserMedia({
          video: callType === 'video' ? { facingMode: { ideal: 'user' } } : false,
          audio: true,
        }),
      ]);
      setLocalStream(stream);
      localStreamRef.current = stream;
      if (callType === 'video') {
        setFacingMode(stream.getVideoTracks()[0]?.getSettings().facingMode === 'environment' ? 'environment' : 'user');
        void detectSwitchableCamera(stream);
      }
      const pc = initiatePeerConnection(partnerId, iceServers);
      stream.getTracks().forEach(track => pc.addTrack(track, stream));
      await pc.setRemoteDescription(new RTCSessionDescription(callerInfo.signalData));
      await flushPendingIce(pc);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      emit('call:accept', { callerId: partnerId, signalData: answer });
    } catch (error) {
      console.error('Không thể chấp nhận cuộc gọi:', error);
      toast.error('Lỗi kết nối cuộc gọi.');
      cleanupCall();
    }
  }, [callType, callerInfo, cleanupCall, detectSwitchableCamera, emit, flushPendingIce, initiatePeerConnection]);

  const endCall = useCallback(() => {
    if (targetUserIdRef.current) emit('call:end', { targetId: targetUserIdRef.current });
    cleanupCall();
  }, [cleanupCall, emit]);

  const declineCall = useCallback(() => {
    if (callerInfo) emit('call:reject', { callerId: callerInfo._id });
    cleanupCall();
  }, [callerInfo, cleanupCall, emit]);

  const toggleMute = useCallback(() => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setIsMuted(!track.enabled);
  }, []);

  const toggleCamera = useCallback(() => {
    const track = localStreamRef.current?.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setIsVideoOff(!track.enabled);
  }, []);

  const switchCamera = useCallback(async () => {
    const currentStream = localStreamRef.current;
    const currentVideoTrack = currentStream?.getVideoTracks()[0];
    if (!canSwitchCamera || !currentVideoTrack || screenStreamRef.current || cameraSwitchingRef.current) return;

    const nextFacingMode = facingMode === 'user' ? 'environment' : 'user';
    const requestId = ++cameraSwitchRequestRef.current;
    let replacementStream;
    cameraSwitchingRef.current = true;
    setIsSwitchingCamera(true);
    try {
      replacementStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { exact: nextFacingMode } },
        audio: false,
      });
      if (requestId !== cameraSwitchRequestRef.current || localStreamRef.current !== currentStream) {
        replacementStream.getTracks().forEach(track => track.stop());
        replacementStream = null;
        return;
      }
      const replacementTrack = replacementStream.getVideoTracks()[0];
      if (!replacementTrack) throw new Error('Không tìm thấy video track của camera mới.');
      replacementTrack.enabled = currentVideoTrack.enabled;
      const nextStream = new MediaStream([...currentStream.getAudioTracks(), replacementTrack]);
      await replaceOutgoingVideoTrack(pcRef.current, replacementTrack);

      localStreamRef.current = nextStream;
      setLocalStream(nextStream);
      setFacingMode(nextFacingMode);
      currentVideoTrack.stop();
    } catch (error) {
      replacementStream?.getTracks().forEach(track => track.stop());
      console.error('Không thể chuyển camera:', error);
      toast.error('Không thể chuyển camera trước/sau.');
    } finally {
      if (requestId === cameraSwitchRequestRef.current) {
        cameraSwitchingRef.current = false;
        setIsSwitchingCamera(false);
      }
    }
  }, [canSwitchCamera, facingMode]);

  const stopScreenShare = useCallback(async () => {
    const stream = screenStreamRef.current;
    if (!stream) return;
    screenStreamRef.current = null;

    try {
      await replaceOutgoingVideoTrack(pcRef.current, localStreamRef.current?.getVideoTracks()[0]);
    } catch (error) {
      console.error('Không thể quay lại camera:', error);
      toast.error('Không thể quay lại camera.');
    } finally {
      if (targetUserIdRef.current) {
        emit('call:screen-share', { targetId: targetUserIdRef.current, sharing: false });
      }
      stream.getTracks().forEach(track => track.stop());
      setScreenStream(null);
    }
  }, [emit]);

  const toggleScreenShare = useCallback(async () => {
    if (screenStreamRef.current) {
      await stopScreenShare();
      return;
    }
    if (!navigator.mediaDevices?.getDisplayMedia) {
      toast.error('Thiết bị này không hỗ trợ chia sẻ màn hình.');
      return;
    }

    let stream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const screenTrack = stream.getVideoTracks()[0];
      await replaceOutgoingVideoTrack(pcRef.current, screenTrack);
      screenStreamRef.current = stream;
      screenTrack.onended = () => { void stopScreenShare(); };
      setScreenStream(stream);
      emit('call:screen-share', { targetId: targetUserIdRef.current, sharing: true });
    } catch (error) {
      stream?.getTracks().forEach(track => track.stop());
      if (error?.name !== 'NotAllowedError') {
        console.error('Không thể chia sẻ màn hình:', error);
        toast.error('Không thể chia sẻ màn hình.');
      }
    }
  }, [emit, stopScreenShare]);

  useEffect(() => {
    const offCallRequest = on('call:request', ({ caller, signalData, type }) => {
      setCallState('ringing-in');
      setCallType(type);
      setCallerInfo({ ...caller, signalData });
      targetUserIdRef.current = caller._id;
    });
    const offCallAccept = on('call:accept', async ({ signalData }) => {
      const pc = pcRef.current;
      if (!pc) return;
      await pc.setRemoteDescription(new RTCSessionDescription(signalData));
      await flushPendingIce(pc);
      setCallState('active');
    });
    const offCallReject = on('call:reject', () => {
      toast.error('Người dùng bận hoặc đã từ chối cuộc gọi.');
      cleanupCall();
    });
    const offCallResolved = on('call:resolved', ({ callerId }) => {
      if (callState === 'ringing-in' && callerInfo?._id?.toString() === callerId?.toString()) cleanupCall();
    });
    const offCallIceCandidate = on('call:ice-candidate', async ({ candidate }) => {
      const pc = pcRef.current;
      if (!pc) {
        pendingIceRef.current.push(candidate);
        return;
      }

      if (!pc.remoteDescription) {
        pendingIceRef.current.push(candidate);
        return;
      }

      try {
        const candidateQueue = [...pendingIceRef.current, candidate];
        pendingIceRef.current = [];
        await flushIceCandidateQueue({
          queue: candidateQueue,
          onCandidate: async (nextCandidate) => {
            await pc.addIceCandidate(new RTCIceCandidate(nextCandidate));
          },
        });
      } catch (error) {
        console.error('Lỗi khi nạp ICE Candidate:', error);
      }
    });
    const offCallEnd = on('call:end', cleanupCall);
    const offScreenShare = on('call:screen-share', ({ senderId, sharing }) => {
      if (senderId?.toString() !== targetUserIdRef.current?.toString()) return;
      setIsRemoteScreenSharing(sharing === true);
    });
    const offCallFailed = on('call:failed', ({ reason }) => {
      toast.error(reason === 'offline' ? 'Người dùng hiện đang ngoại tuyến.' : 'Cuộc gọi thất bại.');
      cleanupCall();
    });
    return () => {
      offCallRequest();
      offCallAccept();
      offCallReject();
      offCallResolved();
      offCallIceCandidate();
      offCallEnd();
      offScreenShare();
      offCallFailed();
    };
  }, [callState, callerInfo, cleanupCall, flushPendingIce, on]);

  useEffect(() => disposeCall, [disposeCall]);

  const value = useMemo(() => ({ startCall }), [startCall]);
  return (
    <CallContext.Provider value={value}>
      {children}
      <CallModal
        callState={callState}
        callType={callType}
        callerInfo={callerInfo}
        receiverInfo={receiverInfo}
        localStream={screenStream || localStream}
        remoteStream={remoteStream}
        isScreenSharing={Boolean(screenStream)}
        isRemoteScreenSharing={isRemoteScreenSharing}
        onAccept={acceptCall}
        onDecline={declineCall}
        onCancel={endCall}
        onEndCall={endCall}
        isMuted={isMuted}
        isVideoOff={isVideoOff}
        canSwitchCamera={canSwitchCamera}
        facingMode={facingMode}
        isSwitchingCamera={isSwitchingCamera}
        toggleMute={toggleMute}
        toggleCamera={toggleCamera}
        switchCamera={switchCamera}
        toggleScreenShare={toggleScreenShare}
        isMinimized={isMinimized}
        setIsMinimized={setIsMinimized}
      />
    </CallContext.Provider>
  );
}

export const useCall = () => useContext(CallContext);
