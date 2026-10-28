'use client';

import { useState, type ChangeEventHandler } from 'react';

type PasswordFieldProps = {
  autoComplete: 'current-password' | 'new-password';
  disabled?: boolean;
  id: string;
  label: string;
  minLength?: number;
  name: string;
  onChange: ChangeEventHandler<HTMLInputElement>;
  value: string;
};

export function PasswordField({
  autoComplete,
  disabled = false,
  id,
  label,
  minLength,
  name,
  onChange,
  value,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="space-y-1.5">
      <label
        className="block text-sm font-medium text-neutral-700 dark:text-neutral-200"
        htmlFor={id}
      >
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          name={name}
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          autoCapitalize="none"
          disabled={disabled}
          maxLength={256}
          minLength={minLength}
          onChange={onChange}
          required
          spellCheck={false}
          value={value}
          className="w-full rounded-xl border border-neutral-200 bg-white/80 px-4 py-3 pr-16 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:ring-4 focus:ring-sky-400/25 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/15 dark:bg-white/5 dark:text-neutral-100 dark:placeholder:text-neutral-500"
        />
        <button
          type="button"
          aria-controls={id}
          aria-label={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
          aria-pressed={visible}
          disabled={disabled}
          onClick={() => setVisible((current) => !current)}
          className="absolute inset-y-0 right-0 rounded-r-xl px-3 text-xs font-medium text-neutral-500 hover:text-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-sky-500 disabled:cursor-not-allowed dark:text-neutral-400 dark:hover:text-neutral-100"
        >
          {visible ? 'Hide' : 'Show'}
        </button>
      </div>
    </div>
  );
}
