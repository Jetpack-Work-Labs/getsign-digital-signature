export interface IServerEnv {
  env: "development" | "production";
  aws: {
    region: string;
    // Omit when running on EC2 with an IAM role — SDK picks up credentials
    // automatically from the instance metadata service.
    credentials?: {
      accessKeyId: string;
      secretAccessKey: string;
    };
    queueUrl: string;
  };
  sentry: {
    dns: string;
  };
  ejbca: {
    restBase: string;
    adminP12: string;
    adminPassphrase: string;
    signingCa: string;
    certProfile: string;
    eeProfile: string;
  };
  // Directory where per-company PKCS#12 keystores live: {keystoreDir}/{accountId}.p12
  keystoreDir: string;
  // Single password used for every per-company keystore file.
  keystorePassword: string;
}
