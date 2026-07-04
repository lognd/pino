// The 3-step guest booking flow -- docs/design/04-booking-and-scheduling.md.
//
// TODO(impl): docs/design/04-booking-and-scheduling.md

import { Stepper } from "../../../components/Stepper";

export function Book() {
  return (
    <main>
      <h1 className="font-display text-4xl font-extrabold italic uppercase text-mp-white">
        Book a class
      </h1>
      <Stepper currentStep={1} totalSteps={3} stepLabels={["Choose a class", "Your details", "Confirm"]} />
      {/* TODO(impl): docs/design/04-booking-and-scheduling.md */}
    </main>
  );
}
