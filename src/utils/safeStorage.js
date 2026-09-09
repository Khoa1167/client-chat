// Đọc/ghi Storage an toàn — throw ở 1 số trình duyệt (Safari ẩn danh, iframe, quota đầy...).
export const safeGet = (storage, key) => {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
};

export const safeSet = (storage, key, value) => {
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
};

export const safeRemove = (storage, key) => {
  try {
    storage.removeItem(key);
  } catch {
    // ignore
  }
};
