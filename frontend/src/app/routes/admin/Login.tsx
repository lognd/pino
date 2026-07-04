// Fake login gate -- docs/design/14-admin-mockup.md: accepts any
// non-empty input (or a hardcoded demo credential) and flips an
// in-memory isMockAuthed flag. Grants NO real security; its only jobs
// are to show Mel roughly where the real login will sit and keep casual
// eyes off the mockup.
//
// TODO(impl): docs/design/14-admin-mockup.md

export function AdminLogin() {
  return (
    <main>
      <h1 className="font-display text-4xl font-extrabold italic uppercase text-mp-white">
        Admin login
      </h1>
      {/* TODO(impl): docs/design/14-admin-mockup.md */}
    </main>
  );
}
