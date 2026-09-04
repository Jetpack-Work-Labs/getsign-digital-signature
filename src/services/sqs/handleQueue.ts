import {
  createP12Docker,
  uploadFile,
  checkWorkerExists,
  CreateCryptoToken,
  createPdfWOrker,
  reloadWorker,
  certificatePath,
} from "../../utils";
import { SignJob, Icertificate } from "../../interfaces";
import {
  createCertificate,
  p12NeedsRenewal,
} from "../certificate";

import { ApplicationService } from "../application";
import { CertificateService } from "../certificate";

export const HandleQueue = async (job: SignJob): Promise<void> => {
  const applicationService = new ApplicationService();
  const certificateService = new CertificateService();
  console.log({ job });
  const { accountId } = job;
  const company = await applicationService.findCompany(accountId);
  if (!company) {
    return;
  }

  let docker_certificate_path;
  let docker_certificate_password;
  let validUntil: Date | undefined;
  let reminted = false;
  let certificate = await certificateService.findByCompanyId(accountId);
  const { user_email, user_name, account_slug } = company || {};
  const hostP12 = `${certificatePath}/${accountId}.p12`;
  const shouldRemint =
    !certificate ||
    p12NeedsRenewal(hostP12, certificate.password);

  if (!certificate || shouldRemint) {
    const { certificatePath: mintedPath, password, validUntil: until } =
      await createCertificate({
        serialNumber: `${accountId}`,
        commonName: `${user_name} (${user_email})`,
        countryName: "",
        state: "",
        localityName: "",
        organizationName: account_slug || "",
        password: certificate?.password,
      });
    docker_certificate_password = password;
    validUntil = until;
    const { fileUrl, fileName } = await uploadFile({
      filePath: mintedPath,
      type: "p12",
    });
    docker_certificate_path = await createP12Docker(mintedPath);
    reminted = Boolean(certificate);
    if (!certificate) {
      const certificatePayload: Icertificate = {
        accountId,
        fileUrl,
        fileName,
        password,
        dockerFilePath: docker_certificate_path,
        validUntil,
      };
      certificate = await certificateService.createCertificate(
        certificatePayload
      );
    } else {
      await certificateService.updateCertificates({
        accountId,
        fileUrl,
        fileName,
        dockerFilePath: docker_certificate_path,
        validUntil,
      });
    }
  } else {
    docker_certificate_password = certificate.password;
    docker_certificate_path = certificate.dockerFilePath;
  }

  const cryptoWorkerId = String(accountId) + "0";
  const pdfWorkerId = String(accountId) + "1";
  const { exists: crypto_token_exist } = await checkWorkerExists({
    worker: cryptoWorkerId,
  });
  const { exists: pdf_signer_exist } = await checkWorkerExists({
    worker: pdfWorkerId,
  });
  console.log({ crypto_token_exist, pdf_signer_exist, reminted });

  if (!crypto_token_exist) {
    await CreateCryptoToken({
      workerId: cryptoWorkerId,
      token_name: cryptoWorkerId,
      KEYSTOREPATH: docker_certificate_path,
      KEYSTOREPASSWORD: docker_certificate_password,
      DEFAULTKEY: "signer00003",
    });
  } else if (reminted) {
    await reloadWorker(cryptoWorkerId);
  }
  if (!pdf_signer_exist) {
    await createPdfWOrker({
      workerId: pdfWorkerId,
      token_name: cryptoWorkerId,
      DEFAULTKEY: "signer00003",
    });
  } else if (reminted) {
    await reloadWorker(pdfWorkerId);
  }

  console.log({
    accountId,
    workerId: pdfWorkerId,
    tokenId: cryptoWorkerId,
  });
  await certificateService.updateCertificates({
    accountId,
    workerId: pdfWorkerId,
    tokenId: cryptoWorkerId,
    validUntil,
  });
};
