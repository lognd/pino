// The load-bearing mockup guardrail -- docs/design/14-admin-mockup.md:
// "Every mockup screen renders a fixed, always-visible banner reading
// exactly `MOCKUP -- SAMPLE DATA`... It does not scroll away and cannot
// be dismissed." This is what stops Mel from ever believing the admin
// mockup is a live system managing real students. Every admin route
// renders this component; do not make it dismissible or conditional.

export function SampleBanner() {
  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-50 flex h-10 items-center justify-center border-b-2 border-mp-red bg-mp-black-true px-4 text-center font-display text-base font-extrabold uppercase italic tracking-tight text-mp-red"
    >
      MOCKUP -- SAMPLE DATA
    </div>
  );
}
