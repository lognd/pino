// The 3-step booking flow's step indicator -- docs/design/04-booking-and-scheduling.md.
//
// TODO(impl): docs/design/04-booking-and-scheduling.md

export interface StepperProps {
  currentStep: number;
  totalSteps: number;
  stepLabels: string[];
}

export function Stepper({ currentStep, totalSteps, stepLabels }: StepperProps) {
  return (
    <ol className="flex gap-4" aria-label="booking progress">
      {/* TODO(impl): docs/design/04-booking-and-scheduling.md */}
      {stepLabels.slice(0, totalSteps).map((label, index) => (
        <li
          key={label}
          aria-current={index === currentStep - 1 ? "step" : undefined}
          className="text-lg text-mp-white"
        >
          {label}
        </li>
      ))}
    </ol>
  );
}
