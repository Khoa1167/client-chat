export default function FabFlower({ children, className = '', label = 'Thêm chức năng', direction = 'left' }) {
  const toggleWithKeyboard = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      event.currentTarget.click();
    }
  };

  return (
    <div
      dir={direction === 'right' ? 'rtl' : undefined}
      className={`fab fab-flower !relative !inset-auto !bottom-auto !right-auto !z-20 mr-1 ${className}`}
    >
      <div
        tabIndex={0}
        role="button"
        aria-label={label}
        onKeyDown={toggleWithKeyboard}
        className="btn btn-sm btn-circle btn-ghost hover:!text-primary"
        title={label}
      >
        <span className="text-lg leading-none">+</span>
      </div>
      {children}
    </div>
  );
}
