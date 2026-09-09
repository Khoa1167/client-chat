import { motion } from 'motion/react';
import { useState } from 'react';

// path gốc lấy từ Phosphor Icons (weight "regular", MIT license) — fill-based, không phải
// stroke như lucide-react cũ, nên không có prop stroke/strokeWidth.
export function createAnimatedIcon(path, { variants, transition, displayName } = {}) {
  function Icon({ className, ...props }) {
    const [hover, setHover] = useState(false);
    return (
      <motion.svg
        className={className}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        animate={hover ? 'animate' : 'normal'}
        initial="normal"
        variants={variants}
        transition={transition}
        viewBox="0 0 256 256"
        fill="currentColor"
        xmlns="http://www.w3.org/2000/svg"
        {...props}
      >
        <path d={path} />
      </motion.svg>
    );
  }
  Icon.displayName = displayName;
  return Icon;
}
