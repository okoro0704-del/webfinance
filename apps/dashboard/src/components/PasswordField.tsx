"use client";

import { useState } from "react";

export function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete = "current-password",
  minLength,
  required = true,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  minLength?: number;
  required?: boolean;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          className="input pr-16"
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          minLength={minLength}
        />
        <button
          type="button"
          className="absolute inset-y-0 right-0 px-3 text-xs font-semibold uppercase tracking-[0.08em] text-ink-500 transition hover:text-ink-800"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
        >
          {visible ? "Hide" : "Show"}
        </button>
      </div>
    </div>
  );
}
