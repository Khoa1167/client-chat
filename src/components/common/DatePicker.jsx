import { format, isValid, parseISO } from 'date-fns';
import { DayPicker } from 'react-day-picker';
import { vi as viDayPicker } from 'react-day-picker/locale';

const parseDate = (value) => {
  if (!value) return undefined;
  const date = value instanceof Date ? value : parseISO(value);
  return isValid(date) ? date : undefined;
};

export default function DatePicker({
  mode = 'single',
  value,
  onChange,
  placeholder = 'Chọn ngày',
  ariaLabel = placeholder,
}) {
  const isRange = mode === 'range';
  const selected = isRange
    ? { from: parseDate(value?.from), to: parseDate(value?.to) }
    : parseDate(value);

  let displayValue = placeholder;
  if (isRange && selected.from) {
    displayValue = `${format(selected.from, 'dd/MM/yyyy')}${selected.to ? ` – ${format(selected.to, 'dd/MM/yyyy')}` : ' – ...'}`;
  } else if (!isRange && selected) {
    displayValue = format(selected, 'dd/MM/yyyy');
  }

  const handleSelect = (selection) => {
    if (isRange) {
      onChange?.({
        from: selection?.from ? format(selection.from, 'yyyy-MM-dd') : '',
        to: selection?.to ? format(selection.to, 'yyyy-MM-dd') : '',
      });
      if (selection?.from && selection?.to) document.activeElement?.blur();
      return;
    }

    onChange?.(selection ? format(selection, 'yyyy-MM-dd') : '');
    document.activeElement?.blur();
  };

  return (
    <div className="dropdown w-full">
      <button
        type="button"
        className="input input-bordered input-sm focus:input-primary w-full cursor-pointer flex items-center text-left"
        aria-label={ariaLabel}
        aria-haspopup="dialog"
      >
        {displayValue}
      </button>
      <div tabIndex={0} className="dropdown-content z-10 mt-1">
        <DayPicker
          mode={isRange ? 'range' : 'single'}
          locale={viDayPicker}
          captionLayout="dropdown"
          className="react-day-picker"
          selected={selected}
          onSelect={handleSelect}
        />
      </div>
    </div>
  );
}
