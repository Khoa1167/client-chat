export async function flushIceCandidateQueue({ queue, onCandidate }) {
  while (queue.length > 0) {
    const candidate = queue.shift();
    if (!candidate) continue;

    try {
      await onCandidate(candidate);
    } catch (error) {
      console.error('Lỗi khi xử lý ICE Candidate:', error);
    }
  }
}
