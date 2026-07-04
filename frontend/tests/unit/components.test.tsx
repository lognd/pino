import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { BigButton } from "../../src/components/BigButton";
import { Field } from "../../src/components/Field";
import { StatusBadge } from "../../src/components/StatusBadge";
import { PhoneFallbackNote } from "../../src/components/PhoneFallbackNote";
import { Stepper } from "../../src/components/Stepper";
import { CONTENT } from "../../src/content/mock";

// docs/design/09-design-system.md's elderly-first component contracts.

describe("BigButton", () => {
  it("meets the 56px minimum height contract for primary", () => {
    render(<BigButton>Book a class</BigButton>);
    const button = screen.getByRole("button", { name: "Book a class" });
    expect(button.className).toMatch(/min-h-\[56px\]/);
  });

  it("meets the 56px minimum height contract for secondary", () => {
    render(<BigButton variant="secondary">Cancel my booking</BigButton>);
    const button = screen.getByRole("button", { name: "Cancel my booking" });
    expect(button.className).toMatch(/min-h-\[56px\]/);
  });
});

describe("Field", () => {
  it("associates its label with the input and shows an inline error", () => {
    render(<Field id="email" label="Email address" errorMessage="Please type your email address" />);
    const input = screen.getByLabelText("Email address");
    expect(input).toBeInTheDocument();
    expect(screen.getByText("Please type your email address")).toBeInTheDocument();
  });
});

describe("StatusBadge", () => {
  it("renders status as visible text, never a bare dot", () => {
    render(<StatusBadge status="paid" />);
    expect(screen.getByText("Paid")).toBeInTheDocument();
  });
});

describe("PhoneFallbackNote", () => {
  it("renders the call-us line from mock.ts contact", () => {
    render(<PhoneFallbackNote />);
    expect(screen.getByText(CONTENT.contact.phone)).toBeInTheDocument();
  });
});

describe("Stepper", () => {
  it("renders accessible +/- controls with big tap targets", () => {
    render(<Stepper label="Party size" value={2} onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Increase" }).className).toMatch(/min-h-\[48px\]/);
    expect(screen.getByRole("button", { name: "Decrease" }).className).toMatch(/min-h-\[48px\]/);
  });
});

// Sanity check that MemoryRouter-dependent components used in this file can
// still render (Field/BigButton/StatusBadge/PhoneFallbackNote/Stepper don't
// need routing, but this asserts nothing here breaks under it either).
describe("component smoke under a router", () => {
  it("renders without a router-context error", () => {
    render(
      <MemoryRouter>
        <BigButton>Book a class</BigButton>
      </MemoryRouter>,
    );
    expect(screen.getByRole("button", { name: "Book a class" })).toBeInTheDocument();
  });
});
