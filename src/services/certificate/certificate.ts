import { Model } from "mongoose";
import { Icertificate } from "../../interfaces";
import { CertificateModel } from "../../model";

export class CertificateService {
  public model: Model<Icertificate>;

  constructor() {
    this.model = CertificateModel;
  }

  async findByCompanyId(
    accountId: number | string
  ): Promise<Icertificate | null> {
    const certificate = await this.model.findOne({ accountId }).exec();
    if (!certificate) {
      return null;
    }
    return certificate.toObject();
  }
  async createCertificate(payload: Icertificate): Promise<any> {
    return await this.model.create(payload);
  }
  async updateCertificates(payload: Partial<Icertificate>): Promise<any> {
    return await this.model.updateMany(
      { accountId: payload.accountId },
      {
        $set: {
          workerId: payload.workerId,
          tokenId: payload.tokenId,
          ...(payload.validUntil ? { validUntil: payload.validUntil } : {}),
          ...(payload.fileUrl ? { fileUrl: payload.fileUrl } : {}),
          ...(payload.fileName ? { fileName: payload.fileName } : {}),
          ...(payload.dockerFilePath
            ? { dockerFilePath: payload.dockerFilePath }
            : {}),
        },
      }
    );
  }
}
