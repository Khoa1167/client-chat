export function replaceOutgoingVideoTrack(peerConnection, nextTrack) {
  if (nextTrack?.kind !== 'video') throw new Error('Không tìm thấy video track thay thế.');
  const sender = peerConnection?.getSenders().find(({ track }) => track?.kind === 'video');
  if (!sender) throw new Error('Không tìm thấy video sender của cuộc gọi.');
  return sender.replaceTrack(nextTrack);
}
