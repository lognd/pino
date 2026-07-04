// ---------------------------------------------------------------------------
// LOUD NOTICE (docs/design/00-overview.md, "Business identity" section):
// the public brand name is configurable and lives in EXACTLY TWO places in
// this whole repo:
//   1. Backend: AppConfig.business_legal_name / business_short_name
//      (env BUSINESS_LEGAL_NAME / BUSINESS_SHORT_NAME).
//   2. Frontend: THIS FILE (env VITE_BUSINESS_LEGAL_NAME /
//      VITE_BUSINESS_SHORT_NAME).
// Every other frontend file interpolates from the exports below -- never
// hardcode "Mel Pino" or "Mel Pino, LLC" as a string literal anywhere else
// (the wordmark SVG asset is the one sanctioned exception; replacing the
// brand means replacing that asset too). Grepping the repo for a
// hardcoded name outside these two files (plus docs/ and the wordmark
// asset) must return nothing -- this is a CI check, not a suggestion.
// ---------------------------------------------------------------------------

const DEFAULT_BUSINESS_LEGAL_NAME = "Mel Pino, LLC";
const DEFAULT_BUSINESS_SHORT_NAME = "Mel Pino";

export const businessLegalName: string =
  import.meta.env.VITE_BUSINESS_LEGAL_NAME ?? DEFAULT_BUSINESS_LEGAL_NAME;

export const businessShortName: string =
  import.meta.env.VITE_BUSINESS_SHORT_NAME ?? DEFAULT_BUSINESS_SHORT_NAME;
