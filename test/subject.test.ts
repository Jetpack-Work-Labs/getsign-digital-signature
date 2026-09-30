import assert from "node:assert/strict";
import test from "node:test";
import { enrollmentIdentity } from "../src/services/ca/subject";

test("enrollment subject uses the company name and email", () => {
  assert.deepEqual(
    enrollmentIdentity({
      accountId: "123",
      companyName: "Acme Inc",
      userEmail: "admin@acme.com",
    }),
    {
      commonName: "Acme Inc (admin@acme.com)",
      organizationName: "Acme Inc",
    },
  );
});

test("enrollment with only an account id still gets a subject", () => {
  assert.deepEqual(enrollmentIdentity({ accountId: "123" }), {
    commonName: "123",
    organizationName: "123",
  });
});
