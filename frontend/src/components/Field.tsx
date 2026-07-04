// One-column form field: label ABOVE input, 18px+ text, inline error in
// plain words -- docs/design/09-design-system.md's forms contract.
//
// TODO(impl): docs/design/09-design-system.md

import type { InputHTMLAttributes } from "react";

export interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  errorMessage?: string;
}

export function Field({ label, errorMessage, id, ...rest }: FieldProps) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-lg font-semibold text-mp-white">
        {label}
      </label>
      {/* TODO(impl): docs/design/09-design-system.md */}
      <input id={id} {...rest} className="min-h-[48px] border-2 border-mp-border bg-mp-surface px-3 text-lg text-mp-white" />
      {errorMessage ? <p className="text-lg text-mp-red">{errorMessage}</p> : null}
    </div>
  );
}
