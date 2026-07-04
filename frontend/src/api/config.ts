// Public runtime config reads (e.g. business hours/address for
// LocalBusiness structured data, if not fully static) -- see
// docs/design/10-seo-and-content.md section 3. CRIB:
// logand.app/frontend/src/api/adminVersion.ts for the single-GET,
// single-shape convention this file follows.
//
// TODO(impl): docs/design/10-seo-and-content.md

import { apiGet } from "./client";

export interface PublicConfig {
  business_legal_name: string;
  business_short_name: string;
}

export function fetchPublicConfig(): Promise<PublicConfig> {
  return apiGet<PublicConfig>("/api/config");
}
