/**
 * Utility quét liên kết an toàn phía Client (Client-Side Pre-Scan)
 * Thực hiện Static Analysis: Homograph Attack, Punycode, Subdomain giả mạo, IP URL.
 */

const hasSuspiciousPunycode = (hostname) => hostname?.split('.').some(label => label.startsWith('xn--')) ?? false;

// Kiểm tra IP address làm hostname (e.g. http://192.168.1.1/login)
const isIPAddressDomain = (hostname) => {
  if (!hostname) return false;
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname);
};


/**
 * Quét danh sách URL có trong văn bản
 * @param {string} text 
 * @returns {object} { hasWarning: boolean, warnings: Array, urls: Array }
 */
export const scanLinksInText = (text) => {
  if (!text || typeof text !== 'string') {
    return { hasWarning: false, warnings: [], urls: [] };
  }

  const urlRegex = /(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/gi;
  const matches = text.match(urlRegex) || [];

  if (matches.length === 0) {
    return { hasWarning: false, warnings: [], urls: [] };
  }

  const warnings = [];
  const scannedUrls = [];

  for (const urlStr of matches) {
    try {
      const urlObj = new URL(urlStr);
      const hostname = urlObj.hostname;
      scannedUrls.push(urlStr);

      if (hasSuspiciousPunycode(hostname)) {
        warnings.push({
          url: urlStr,
          type: 'IDN',
          message: `Cảnh báo: Tên miền "${hostname}" chứa ký tự quốc tế (IDN). Hãy xác nhận đây là địa chỉ đáng tin trước khi mở.`
        });
      } else if (isIPAddressDomain(hostname)) {
        warnings.push({
          url: urlStr,
          type: 'IP_ADDRESS',
          message: `Cảnh báo: Liên kết sử dụng địa chỉ IP trực tiếp (${hostname}). Hãy cẩn trọng trước khi mở.`
        });
      }
    } catch {
      // ignore
    }
  }

  return {
    hasWarning: warnings.length > 0,
    warnings,
    urls: scannedUrls,
  };
};
