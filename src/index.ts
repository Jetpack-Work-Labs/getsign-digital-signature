import { app } from "./app";
import { ensureLocalCa } from "./services/ca/local";
import { HandleQueue, pollAndProcessJobs } from "./services/sqs";
import { config } from "./config";
import { recoverSignJobs } from "./services/jobs/store";

const PORT = 9999;

const initializeApp = async () => {
  try {
    ensureLocalCa();
    recoverSignJobs(config.jobsDir);
    pollAndProcessJobs(HandleQueue);
    console.log("✅ SQS polling started");
    app.listen(PORT, () => {
      console.log(`✅ Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("❌ Failed to initialize application:", error);
    process.exit(1);
  }
};

initializeApp();
