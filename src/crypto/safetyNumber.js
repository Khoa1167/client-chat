// Safety Number (Key Fingerprint) — đối chiếu giữa 2 thiết bị để xác thực không bị Man-in-the-Middle.

export const computeFingerprint = async (publicKeyJWK) => {
  if (!publicKeyJWK) return '';
  const encoder = new TextEncoder();
  const data = encoder.encode(typeof publicKeyJWK === 'string' ? publicKeyJWK : JSON.stringify(publicKeyJWK));
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));

  // Format thành 12 nhóm x 5 chữ số
  const digits = hashArray.map(b => b.toString().padStart(3, '0')).join('');
  const formatted = [];
  for (let i = 0; i < 60; i += 5) {
    formatted.push(digits.substring(i, i + 5));
  }
  return formatted.join(' ');
};
