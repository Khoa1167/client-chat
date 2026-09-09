// Log chỉ hiện ở dev — tránh xả noise vào console production.
export const debugLog = (...args) => {
  if (import.meta.env.DEV) console.log(...args);
};
