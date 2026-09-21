/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Device } from 'mediasoup-client';
import GroupCallModal from '../components/Call/GroupCallModal';
import { toast } from '../components/common/toastStore';
import { useSocket } from '../hooks/useSocket';
import { useAuth } from './AuthContext';
import { getCallIceServers } from '../api/auth.api';

const GroupCallContext = createContext(null);

const FAILED_REASON_MESSAGE = {
  room_full: 'Phòng gọi đã đủ 20 người.',
  not_allowed: 'Bạn không có quyền tham gia cuộc gọi này.',
  rate_limited: 'Vui lòng thử lại sau.',
  screen_share_busy: 'Đã có người khác đang chia sẻ màn hình.',
};

export function GroupCallProvider({ children }) {
  const { on, emit } = useSocket();
  const { user } = useAuth();
  const [callState, setCallState] = useState('idle'); // 'idle' | 'active'
  const [activeRoom, setActiveRoom] = useState(null); // { roomId, callType }
  const [localStream, setLocalStream] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [participants, setParticipants] = useState(new Map()); // userId -> { stream, isScreenSharing, username }
  const [isMinimized, setIsMinimized] = useState(false);
  const [roomMembers, setRoomMembers] = useState([]); // để GroupCallModal tra avatar theo userId
  // Set các roomId đang có cuộc gọi active — để hiện banner "tham gia" ở phòng chưa join.
  const [activeCallRooms, setActiveCallRooms] = useState(new Set());

  const deviceRef = useRef(null);
  const sendTransportRef = useRef(null);
  const recvTransportRef = useRef(null);
  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const audioProducerRef = useRef(null);
  const videoProducerRef = useRef(null);
  const consumersRef = useRef(new Map()); // consumerId -> consumer
  const roomIdRef = useRef(null);
  const eventCleanupRef = useRef([]);

  // Bọc emit socket ack thành Promise — mọi lỗi từ server trả về { error } thay vì throw exception.
  const emitAsync = useCallback((event, data) => new Promise((resolve, reject) => {
    emit(event, data, (res) => {
      if (res?.error) reject(Object.assign(new Error(res.error), { code: res.error }));
      else resolve(res);
    });
  }), [emit]);

  const updateParticipant = useCallback((userId, patch) => {
    setParticipants(prev => {
      const next = new Map(prev);
      const existing = next.get(userId) || { userId, stream: new MediaStream(), isScreenSharing: false };
      next.set(userId, { ...existing, ...patch });
      return next;
    });
  }, []);

  const consumeProducer = useCallback(async (producerId, kind, remoteUserId) => {
    const roomId = roomIdRef.current;
    const device = deviceRef.current;
    if (!roomId || !device || !recvTransportRef.current) return;

    const { id, rtpParameters } = await emitAsync('call:group-consume', {
      roomId, transportId: recvTransportRef.current.id, producerId, rtpCapabilities: device.rtpCapabilities,
    });
    const consumer = await recvTransportRef.current.consume({ id, producerId, kind, rtpParameters, appData: { remoteUserId } });
    consumersRef.current.set(consumer.id, consumer);

    setParticipants(prev => {
      const next = new Map(prev);
      const existing = next.get(remoteUserId) || { userId: remoteUserId, stream: new MediaStream(), isScreenSharing: false };
      existing.stream.addTrack(consumer.track);
      next.set(remoteUserId, existing);
      return next;
    });

    await emitAsync('call:group-resume-consumer', { roomId, consumerId: consumer.id });
  }, [emitAsync]);

  const disposeMediasoup = useCallback(() => {
    consumersRef.current.forEach(c => c.close());
    consumersRef.current.clear();
    audioProducerRef.current?.close();
    audioProducerRef.current = null;
    videoProducerRef.current?.close();
    videoProducerRef.current = null;
    sendTransportRef.current?.close();
    sendTransportRef.current = null;
    recvTransportRef.current?.close();
    recvTransportRef.current = null;
    deviceRef.current = null;
    screenStreamRef.current?.getTracks().forEach(t => t.stop());
    screenStreamRef.current = null;
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    eventCleanupRef.current.forEach(off => off());
    eventCleanupRef.current = [];
  }, []);

  const cleanupGroupCall = useCallback(() => {
    disposeMediasoup();
    roomIdRef.current = null;
    setCallState('idle');
    setActiveRoom(null);
    setLocalStream(null);
    setParticipants(new Map());
    setIsMuted(false);
    setIsVideoOff(false);
    setIsScreenSharing(false);
    setIsMinimized(false);
    setRoomMembers([]);
  }, [disposeMediasoup]);

  const leaveGroupCall = useCallback(() => {
    const roomId = roomIdRef.current;
    if (roomId) emit('call:group-leave', { roomId });
    cleanupGroupCall();
  }, [cleanupGroupCall, emit]);

  const joinGroupCall = useCallback(async (room, members, type) => {
    if (callState !== 'idle') return;
    const roomId = room._id;
    try {
      const [iceServers, stream] = await Promise.all([
        getCallIceServers(),
        navigator.mediaDevices.getUserMedia({ video: type === 'video', audio: true }),
      ]);

      const joinRes = await emitAsync('call:group-join', { roomId });

      roomIdRef.current = roomId;
      localStreamRef.current = stream;
      setLocalStream(stream);
      setActiveRoom({ roomId, callType: type });
      setCallState('active');
      setRoomMembers(members || []);

      const device = new Device();
      await device.load({ routerRtpCapabilities: joinRes.rtpCapabilities });
      deviceRef.current = device;

      const sendParams = await emitAsync('call:group-create-transport', { roomId });
      const sendTransport = device.createSendTransport({ ...sendParams, iceServers });
      sendTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
        emitAsync('call:group-connect-transport', { roomId, transportId: sendTransport.id, dtlsParameters })
          .then(callback).catch(errback);
      });
      sendTransport.on('produce', ({ kind, rtpParameters }, callback, errback) => {
        emitAsync('call:group-produce', { roomId, transportId: sendTransport.id, kind, rtpParameters })
          .then(({ id }) => callback({ id })).catch(errback);
      });
      sendTransportRef.current = sendTransport;

      const recvParams = await emitAsync('call:group-create-transport', { roomId });
      const recvTransport = device.createRecvTransport({ ...recvParams, iceServers });
      recvTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
        emitAsync('call:group-connect-transport', { roomId, transportId: recvTransport.id, dtlsParameters })
          .then(callback).catch(errback);
      });
      recvTransportRef.current = recvTransport;

      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) audioProducerRef.current = await sendTransport.produce({ track: audioTrack });
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) videoProducerRef.current = await sendTransport.produce({ track: videoTrack });

      joinRes.otherProducers.forEach(p => updateParticipant(p.userId, { username: p.username }));
      await Promise.all(joinRes.otherProducers.map(p => consumeProducer(p.producerId, p.kind, p.userId)));

      const offPeerJoined = on('call:group-peer-joined', ({ userId: joinedUserId, username: joinedUsername }) => {
        updateParticipant(joinedUserId, { username: joinedUsername });
      });
      const offNewProducer = on('call:group-new-producer', ({ producerId, kind, userId: producerUserId }) => {
        if (roomIdRef.current === roomId) void consumeProducer(producerId, kind, producerUserId);
      });
      const offPeerLeft = on('call:group-peer-left', ({ userId: leftUserId }) => {
        setParticipants(prev => {
          const next = new Map(prev);
          next.delete(leftUserId);
          return next;
        });
      });
      const offScreenShare = on('call:group-screen-share', ({ userId: sharerId, sharing }) => {
        updateParticipant(sharerId, { isScreenSharing: sharing });
      });
      const offFailed = on('call:group-failed', ({ reason }) => {
        toast.error(FAILED_REASON_MESSAGE[reason] || 'Cuộc gọi nhóm gặp lỗi.');
      });
      eventCleanupRef.current = [offPeerJoined, offNewProducer, offPeerLeft, offScreenShare, offFailed];
    } catch (error) {
      console.error('Không thể tham gia cuộc gọi nhóm:', error);
      toast.error(FAILED_REASON_MESSAGE[error.code] || 'Không thể tham gia cuộc gọi nhóm.');
      cleanupGroupCall();
    }
  }, [callState, cleanupGroupCall, consumeProducer, emitAsync, on, updateParticipant]);

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

  const stopScreenShare = useCallback(async () => {
    const stream = screenStreamRef.current;
    if (!stream) return;
    screenStreamRef.current = null;
    try {
      const cameraTrack = localStreamRef.current?.getVideoTracks()[0];
      if (cameraTrack && videoProducerRef.current) await videoProducerRef.current.replaceTrack({ track: cameraTrack });
    } catch (error) {
      console.error('Không thể quay lại camera:', error);
      toast.error('Không thể quay lại camera.');
    } finally {
      if (roomIdRef.current) emit('call:group-screen-share', { roomId: roomIdRef.current, sharing: false });
      stream.getTracks().forEach(t => t.stop());
      setIsScreenSharing(false);
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
    if (!videoProducerRef.current) {
      toast.error('Cần bật camera trước khi chia sẻ màn hình.');
      return;
    }

    let stream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const screenTrack = stream.getVideoTracks()[0];
      await videoProducerRef.current.replaceTrack({ track: screenTrack });
      screenStreamRef.current = stream;
      screenTrack.onended = () => { void stopScreenShare(); };
      setIsScreenSharing(true);
      emit('call:group-screen-share', { roomId: roomIdRef.current, sharing: true });
    } catch (error) {
      stream?.getTracks().forEach(t => t.stop());
      if (error?.name !== 'NotAllowedError') {
        console.error('Không thể chia sẻ màn hình:', error);
        toast.error('Không thể chia sẻ màn hình.');
      }
    }
  }, [emit, stopScreenShare]);

  // Bị kick/rời phòng hoặc phòng bị xóa trong lúc đang gọi nhóm — server đã ngắt media ở tầng SFU
  // (sfu.forceLeaveRoomForUser), đây chỉ dọn UI/state phía client cho đúng ngay lập tức thay vì
  // đợi phát hiện qua lỗi kết nối. Đăng ký 1 lần cho cả vòng đời provider, không phụ thuộc callState
  // vì sự kiện có thể tới bất cứ lúc nào trong lúc đang active.
  useEffect(() => {
    const offRoomRemoved = on('room:removed', ({ roomId }) => {
      if (roomIdRef.current === roomId) {
        toast.error('Bạn không còn ở trong phòng này — đã rời cuộc gọi nhóm.');
        cleanupGroupCall();
      }
    });
    return offRoomRemoved;
  }, [on, cleanupGroupCall]);

  // Cho phòng biết đang có/hết cuộc gọi nhóm dù chưa join — mọi thành viên phòng đều nhận được vì
  // đã socket.join(roomId) sẵn từ lúc connect (không cần đang trong cuộc gọi mới nhận).
  useEffect(() => {
    const offActive = on('call:group-active', ({ roomId }) => {
      setActiveCallRooms(prev => new Set(prev).add(roomId));
    });
    const offEnded = on('call:group-ended', ({ roomId }) => {
      setActiveCallRooms(prev => {
        if (!prev.has(roomId)) return prev;
        const next = new Set(prev);
        next.delete(roomId);
        return next;
      });
    });
    return () => { offActive(); offEnded(); };
  }, [on]);

  const value = useMemo(() => ({ joinGroupCall, callState, activeCallRooms }), [joinGroupCall, callState, activeCallRooms]);

  return (
    <GroupCallContext.Provider value={value}>
      {children}
      <GroupCallModal
        callState={callState}
        activeRoom={activeRoom}
        localStream={localStream}
        localUser={user}
        participants={participants}
        roomMembers={roomMembers}
        isMuted={isMuted}
        isVideoOff={isVideoOff}
        isScreenSharing={isScreenSharing}
        isMinimized={isMinimized}
        setIsMinimized={setIsMinimized}
        onLeave={leaveGroupCall}
        toggleMute={toggleMute}
        toggleCamera={toggleCamera}
        toggleScreenShare={toggleScreenShare}
      />
    </GroupCallContext.Provider>
  );
}

export const useGroupCall = () => useContext(GroupCallContext);
