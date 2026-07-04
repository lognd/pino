/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_USE_MOCKS?: string;
  // Business identity defaults -- see src/lib/brand.ts and
  // docs/design/00-overview.md's business-identity rule (exactly two
  // homes for the name: this env pair, and the backend AppConfig).
  readonly VITE_BUSINESS_LEGAL_NAME?: string;
  readonly VITE_BUSINESS_SHORT_NAME?: string;
  // Hero source selection -- see docs/design/08-landing-hero.md.
  readonly VITE_HERO_SOURCE?: "simulated" | "video";
  readonly VITE_HERO_VIDEO_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
