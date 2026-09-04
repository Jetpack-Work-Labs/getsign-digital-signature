import { Schema, model } from "mongoose";
import { Icertificate } from "../interfaces";

const schema = new Schema<Icertificate>(
  {
    accountId: {
      type: Number,
      required: true,
      index: true,
    },
    fileUrl: {
      type: String,
      required: true,
    },
    fileName: {
      type: String,
      required: true,
    },
    password: {
      type: String,
      required: true,
    },
    dockerFilePath: {
      type: String,
      required: true,
    },
    workerId: {
      type: String,
      required: false,
    },
    tokenId: {
      type: String,
      required: false,
    },
    validUntil: {
      type: Date,
      required: false,
    },
  },
  {
    timestamps: {
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  }
);

export const CertificateModel = model<Icertificate>("certificates", schema);
