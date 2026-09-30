/**
 * Certificate subject for an enrollment job.
 * Company name and email are used when present. An account id alone still enrolls.
 */
export function enrollmentIdentity(job: {
  accountId?: string;
  companyName?: string;
  userEmail?: string;
  organizationName?: string;
}): { commonName: string; organizationName: string } {
  const accountId = job.accountId?.trim() ?? "";
  const companyName = job.companyName?.trim() ?? "";
  const userEmail = job.userEmail?.trim() ?? "";
  const commonName =
    companyName && userEmail
      ? `${companyName} (${userEmail})`
      : companyName || userEmail || accountId;
  if (!commonName) {
    throw new Error("Enrollment requires an accountId");
  }
  return {
    commonName,
    organizationName: job.organizationName?.trim() || companyName || accountId,
  };
}
