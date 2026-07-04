// Party-size +/- stepper -- docs/design/09-design-system.md's elderly-first
// tap-target contract (48x48+ targets, >=8px apart) and
// docs/design/04-booking-and-scheduling.md's "party size stepper" field.
// Scaffolded here for the P3 booking flow to reuse; not wired into a form
// yet (Book.tsx stays a stub per this build's P1 scope).

export interface StepperProps {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (next: number) => void;
}

const BUTTON =
  "flex h-12 w-12 min-h-[48px] min-w-[48px] items-center justify-center " +
  "border-2 border-mp-white bg-transparent text-2xl font-bold text-mp-white " +
  "disabled:cursor-not-allowed disabled:opacity-40";

export function Stepper({ label, value, min = 1, max = 10, onChange }: StepperProps) {
  return (
    <div className="flex flex-col gap-2">
      <span id="stepper-label" className="text-lg font-semibold text-mp-white">
        {label}
      </span>
      <div className="flex items-center gap-3" role="group" aria-labelledby="stepper-label">
        <button
          type="button"
          className={BUTTON}
          disabled={value <= min}
          onClick={() => onChange(Math.max(min, value - 1))}
          aria-label="Decrease"
        >
          -
        </button>
        <span aria-live="polite" className="min-w-[3ch] text-center text-2xl font-bold text-mp-white">
          {value}
        </span>
        <button
          type="button"
          className={BUTTON}
          disabled={value >= max}
          onClick={() => onChange(Math.min(max, value + 1))}
          aria-label="Increase"
        >
          +
        </button>
      </div>
    </div>
  );
}
