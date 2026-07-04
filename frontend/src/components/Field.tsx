// One-column form field: label ABOVE input, 18px+ text, inline error in
// plain words, persistent (not a toast) -- docs/design/09-design-system.md's
// forms contract. The error slot always renders (reserving its own space)
// so appearing text never shifts layout, and it is linked to the input via
// aria-describedby so screen readers announce it.
//
// forwardRef: react-hook-form's register() attaches a ref to the actual
// DOM <input> to read its value at submit time -- a plain function
// component silently drops that ref (React warns "Function components
// cannot be given refs"), which makes every RHF-registered field read
// back as undefined on submit. Found via the /book flow's step-2 form
// (Book.tsx) failing validation on filled-in fields; see
// docs/design/04-booking-and-scheduling.md's RHF+zod form contract.

import { forwardRef, type InputHTMLAttributes } from "react";

export interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  errorMessage?: string;
}

export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, errorMessage, id, className, ...rest },
  ref,
) {
  const errorId = id ? `${id}-error` : undefined;
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-lg font-semibold text-mp-white">
        {label}
      </label>
      <input
        ref={ref}
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
});
