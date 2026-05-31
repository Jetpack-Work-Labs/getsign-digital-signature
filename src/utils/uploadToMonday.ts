import axios, { AxiosResponse } from "axios";

interface FileData { name?: string; type: string; bytes: ArrayBuffer; }
interface UploadMondayFIle { itemId: number; columnId: string; file: FileData; token: string; }
interface MondayApiResponse { data: unknown; }

const uploadContract = async ({
  itemId,
  columnId,
  file,
  token,
}: UploadMondayFIle): Promise<AxiosResponse<MondayApiResponse>> => {
  const url: string = "https://api.monday.com/v2/file";
  const query: string = `mutation add_file($file: File!) { add_file_to_column (file: $file, item_id: ${itemId}, column_id: "${columnId}") { id } }`;
  let data: string = "";
  const boundary: string = "xxxxxxxxxxxxxxx";

  // construct query part
  data += `--${boundary}\r\n`;
  data += 'Content-Disposition: form-data; name="query"\r\n';
  data += "Content-Type: application/json\r\n\r\n";
  data += `\r\n${query}\r\n`;

  if (!file.name) {
    file.name = "signed-adhoc-contract.pdf";
  }

  // construct file part
  data += `--${boundary}\r\n`;
  data += `Content-Disposition: form-data; name="variables[file]"; filename="${file.name}"\r\n`;
  data += `Content-Type: ${file.type}\r\n\r\n`;

  const payload: Buffer = Buffer.concat([
    Buffer.from(data, "utf8"),
    new Uint8Array(file.bytes),
    Buffer.from(`\r\n--${boundary}--\r\n`, "utf8"),
  ]);

  const response: AxiosResponse<MondayApiResponse> = await axios({
    url,
    method: "post",
    headers: {
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
      Authorization: token,
    },
    data: payload,
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
  });

  return response;
};

export { uploadContract };
