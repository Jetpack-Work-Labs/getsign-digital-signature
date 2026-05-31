export interface SignJob {
  accountId: string;
  // Company details used to build the cert subject DN on first enrollment.
  // Ignored if the company is already enrolled (P12 already exists on disk).
  companyName: string;
  userEmail: string;
  organizationName?: string;
  countryName?: string;
}
