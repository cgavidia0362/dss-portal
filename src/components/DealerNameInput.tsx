import { useMemo, useRef, useState } from 'react';

interface DealerNameInputProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export default function DealerNameInput({
  id,
  value,
  onChange,
  suggestions,
  placeholder = 'Dealer name',
  className = '',
  disabled = false,
}: DealerNameInputProps) {
  const [open, setOpen] = useState(false);
  const blurTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filtered = useMemo(() => {
    const query = value.trim().toLowerCase();
    if (!query) return suggestions.slice(0, 8);
    return suggestions
      .filter((name) => name.toLowerCase().includes(query))
      .slice(0, 8);
  }, [suggestions, value]);

  const handleBlur = () => {
    blurTimeout.current = setTimeout(() => setOpen(false), 150);
  };

  const handleFocus = () => {
    if (blurTimeout.current) clearTimeout(blurTimeout.current);
    setOpen(true);
  };

  const handleSelect = (name: string) => {
    onChange(name);
    setOpen(false);
  };

  return (
    <div className="relative">
      <input
        id={id}
        type="text"
        value={value}
        disabled={disabled}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={placeholder}
        autoComplete="off"
        className={className}
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full max-h-48 overflow-y-auto bg-gray-800 border border-gray-600 rounded-lg shadow-lg">
          {filtered.map((name) => (
            <li key={name}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelect(name)}
                className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700 transition"
              >
                {name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
