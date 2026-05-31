import { IServerEnv } from "../interfaces";
import { config as dotenvConfig } from "dotenv";

dotenvConfig();

const LoadFromEnv = (key: string) => {
  if (typeof process.env[key] !== "undefined") {
    return process.env[key];
  }
  throw new Error(`process.env doesn't have the key ${key}`);
};

const LoadFromEnvOr = (key: string, fallback: string): string => {
  const value = process.env[key];
  return typeof value !== "undefined" && value !== "" ? value : fallback;
};

export const config: IServerEnv = {
  env: LoadFromEnv("ENVIRONMENT") as "development" | "production",
  aws: {
    region: LoadFromEnv("AWS_REGION")!,
    credentials: {
      accessKeyId: LoadFromEnv("AWS_ACCESS_KEY_ID")!,
      secretAccessKey: LoadFromEnv("AWS_SECRET_ACCESS_KEY")!,
    },
    queueUrl: LoadFromEnv("SQS_SIGNING_QUEUE_URL"),
  },
  sentry: {
    dns: LoadFromEnv("SENTRY_DSN"),
  },
  ejbca: {
    restBase: LoadFromEnvOr(
      "EJBCA_REST_BASE",
      "https://ejbca:8443/ejbca/ejbca-rest-api/v1"
    ),
    adminP12: LoadFromEnvOr("EJBCA_ADMIN_P12", "./superadmin.p12"),
    adminPassphrase: LoadFromEnvOr("EJBCA_ADMIN_PASSPHRASE", "Root@jetsign"),
    signingCa: LoadFromEnvOr("EJBCA_SIGNING_CA", "GetSign Signing CA"),
    certProfile: LoadFromEnvOr("EJBCA_CERT_PROFILE", "GetSignSigning"),
    eeProfile: LoadFromEnvOr("EJBCA_EE_PROFILE", "GetSignSigning"),
  },
  keystoreDir: LoadFromEnvOr("KEYSTORE_DIR", "/keystores"),
  keystorePassword: LoadFromEnvOr("KEYSTORE_PASSWORD", "changeit"),
};
