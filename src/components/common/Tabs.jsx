// Thanh tab dùng chung (daisyUI tabs-lift), thay JSX tab viết tay lặp lại.
// tabs: [{key, label, activeClassName?, inactiveClassName?}] — bỏ qua thì dùng mặc định 'tab-active'/''.
export default function Tabs({ tabs, active, onChange, className = '', tabClassName = '' }) {
  return (
    <div role="tablist" className={`tabs tabs-lift ${className}`}>
      {tabs.map(t => {
        const isActive = active === t.key;
        const stateClass = isActive ? (t.activeClassName ?? 'tab-active') : (t.inactiveClassName ?? '');
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            onClick={() => onChange(t.key)}
            className={`tab ${tabClassName} ${stateClass} hover:font-semibold`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
