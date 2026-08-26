import React, { useEffect, useMemo, useRef, useState } from 'react';

const flattenOptions = (groups) => groups.flatMap((group) => group.options.map((option) => ({ ...option, group: group.label })));

export default function SearchableSelect({
  groups,
  value,
  onChange,
  placeholder,
  emptyText = 'No matching options',
  className = '',
  disabled = false,
  inputId,
}) {
  const rootRef = useRef(null);
  const allOptions = useMemo(() => flattenOptions(groups), [groups]);
  const selected = allOptions.find((option) => String(option.value) === String(value));
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    const closeOnOutsideClick = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, []);

  const visibleGroups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return groups;
    return groups
      .map((group) => ({ ...group, options: group.options.filter((option) => option.label.toLowerCase().includes(needle)) }))
      .filter((group) => group.options.length > 0);
  }, [groups, query]);

  const choose = (option) => {
    onChange(option.value, option);
    setQuery('');
    setOpen(false);
  };

  return (
    <div ref={rootRef} className={`searchable-select ${open ? 'is-open' : ''} ${className}`}>
      <input
        id={inputId}
        type="text"
        className="form-input searchable-select-input"
        value={open ? query : (selected?.label || '')}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={`${inputId || 'searchable-select'}-options`}
        onFocus={() => { setOpen(true); setQuery(''); }}
        onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(false);
          if (event.key === 'Enter') {
            const first = visibleGroups[0]?.options[0];
            if (open && first) { event.preventDefault(); choose(first); }
          }
        }}
      />
      <button
        type="button"
        className="searchable-select-toggle"
        aria-label={open ? 'Close options' : 'Open options'}
        onClick={() => { setOpen((current) => !current); setQuery(''); }}
        disabled={disabled}
      >⌄</button>
      {open && (
        <div id={`${inputId || 'searchable-select'}-options`} className="searchable-select-menu" role="listbox">
          {visibleGroups.length === 0 && <div className="searchable-select-empty">{emptyText}</div>}
          {visibleGroups.map((group) => (
            <div key={group.label} className="searchable-select-group">
              <div className="searchable-select-group-label">{group.label}</div>
              {group.options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={String(value) === String(option.value)}
                  className={`searchable-select-option ${String(value) === String(option.value) ? 'selected' : ''}`}
                  onClick={() => choose(option)}
                >
                  <span>{option.label}</span>
                  {String(value) === String(option.value) && <span aria-hidden="true">✓</span>}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
