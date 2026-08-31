export type LicenseTier = 'free' | 'pro_monthly' | 'pro_lifetime';

export interface LicensePayload {
  key: string;
  email?: string;
  tier: Exclude<LicenseTier, 'free'>;
  issuedAt: number;
  expiresAt: number | null;
  maxDevices: number;
}

export interface ProState {
  isPro: boolean;
  tier: LicenseTier;
  license?: LicensePayload | null;
  deviceId: string;
  activatedAt?: number | null;
}

export type LicenseActivationError =
  | 'empty_key'
  | 'invalid_license'
  | 'expired_license'
  | 'invalid_response'
  | 'network';

export type LicenseActivationResult =
  | { success: true; state: ProState }
  | { success: false; error: LicenseActivationError; message?: string };
