// Bộ animation dùng chung cho createAnimatedIcon — mỗi icon chỉ cần chọn 1 preset (có tham số
// riêng nếu cần) thay vì tự viết variants từ đầu.
export const pulse = { normal: { scale: 1 }, animate: { scale: [1, 1.15, 1] } };
export const wiggle = { normal: { rotate: 0 }, animate: { rotate: [0, -10, 10, -6, 0] } };
export const spin = { normal: { rotate: 0 }, animate: { rotate: 360 } };
export const bounceY = { normal: { y: 0 }, animate: { y: [0, -3, 0] } };
export const blink = { normal: { scaleY: 1 }, animate: { scaleY: [1, 0.1, 1] } };
export const slideX = (dx) => ({ normal: { x: 0 }, animate: { x: [0, dx, 0] } });
export const rotateTo = (deg) => ({ normal: { rotate: 0 }, animate: { rotate: deg } });

export const T = { duration: 0.4, ease: 'easeInOut' };
export const T_SPIN = { duration: 0.5, ease: 'easeInOut' };
export const T_BOUNCE = { duration: 0.35, ease: 'easeOut' };
