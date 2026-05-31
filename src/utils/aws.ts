import { S3Client } from "@aws-sdk/client-s3";
import { config } from "../config";
import { SQS, SQSClient } from "@aws-sdk/client-sqs";

// When running on EC2 with an IAM role, omit credentials so the SDK uses the
// instance metadata service. When running locally, pass explicit credentials.
const awsClientConfig = {
  region: config.aws.region,
  ...(config.aws.credentials ? { credentials: config.aws.credentials } : {}),
};

export const s3 = new S3Client(awsClientConfig);
export const sqsClient = new SQSClient(awsClientConfig);
export const sqs = new SQS(awsClientConfig);
