// One-column form field: label ABOVE input, 18px+ text, inline error in
// plain words, persistent (not a toast) -- docs/design/09-design-system.md's
// forms contract. The error slot always renders (reserving its own space)
// so appearing text never shifts layout, and it is linked to the input via
// aria-describedby so screen readers announce it.

import type { InputHTMLAttributes } from "react";

export interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  errorMessage?: string;
}

export function Field({ label, errorMessage, id, className, ...rest }: FieldProps) {
  const errorId = id ? `${id}-error` : undefined;
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-lg font-semibold text-mp-white">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={errorMessage ? true : undefined}
        aria-describedby={errorMessage ? errorId : undefined}
        {...rest}
        className={
          "min-h-[48px] border-2 bg-mp-surface px-3 text-lg text-mp-white " +
          (errorMessage ? "border-mp-red" : "border-mp-border") +
          (className ? ` ${className}` : "")
        }
      />
      <p id={errorId} role={errorMessage ? "alert" : undefined} className="min-h-[1.6em] text-lg text-mp-red-text">
        {errorMessage}
      </p>
    </div>
  );
}
