# API Documentation

Complete API reference for GetSign Flow Service.

## Base URL

```
Development: http://localhost:9999
Production:
```

## Endpoints

### Health Check

Check if the service is running and healthy.

**Endpoint:** `GET /health`

**Request:**

```http
GET /health HTTP/1.1
Host: localhost:9999
```

**Response:**

```json
{
  "status": "OK",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "service": "GetSign Flow Service",
  "version": "1.0.0"
}
```

**Status Codes:**

- `200 OK` - Service is healthy

**Example:**

```bash
curl http://localhost:9999/health
```

---

### SignServer Health Check

Check if SignServer is accessible and verify a specific worker's status.

**Endpoint:** `GET /health/signserver`

**Request:**

```http
GET /health/signserver HTTP/1.1
Host: localhost:9999
```

**Response (Success):**

```json
{
  "status": "OK",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "service": "SignServer",
  "workerStatus": "Worker status output from SignServer..."
}
```

**Response (Error):**

```json
{
  "status": "ERROR",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "service": "SignServer",
  "error": "Error message here"
}
```

**Status Codes:**

- `200 OK` - SignServer is accessible
- `500 Internal Server Error` - SignServer is unavailable or worker check failed

**Example:**

```bash
curl http://localhost:9999/health/signserver
```

**Notes:**

- This endpoint executes a Docker command to check SignServer status
- Requires SignServer container to be running
- Checks worker `62823351` by default (hardcoded in implementation)

---

### Sign PDF

Sign a PDF document using a SignServer worker.

**Endpoint:** `POST /signserver/process`

**Content-Type:** `multipart/form-data`

**Request:**

```http
POST /signserver/process HTTP/1.1
Host: localhost:9999
Content-Type: multipart/form-data; boundary=----WebKitFormBoundary7MA4YWxkTrZu0gW

------WebKitFormBoundary7MA4YWxkTrZu0gW
Content-Disposition: form-data; name="datafile"; filename="document.pdf"
Content-Type: application/pdf

[PDF binary data]
------WebKitFormBoundary7MA4YWxkTrZu0gW
Content-Disposition: form-data; name="workerName"

6282336
------WebKitFormBoundary7MA4YWxkTrZu0gW
Content-Disposition: form-data; name="watermark"

true
------WebKitFormBoundary7MA4YWxkTrZu0gW--
```

**Form Fields:**

| Field        | Type   | Required | Description                                       |
| ------------ | ------ | -------- | ------------------------------------------------- |
| `datafile`   | File   | Yes      | PDF file to sign                                  |
| `workerName` | String | Yes      | SignServer worker name/ID (e.g., "6282336")       |
| `watermark`  | String | No       | Set to `"true"` to add clickable watermark to PDF |

**Response:**

```http
HTTP/1.1 200 OK
Content-Type: application/pdf
Content-Disposition: attachment; filename="signed-document.pdf"

[Signed PDF binary data]
```

**Status Codes:**

- `200 OK` - PDF signed successfully
- `400 Bad Request` - Invalid request (missing file, missing workerName, etc.)
- `500 Internal Server Error` - Signing failed

**Error Response:**

```json
{
  "error": "Error message",
  "details": "Detailed error information"
}
```

**Processing Steps:**

1. Receives PDF file via FormData
2. Optionally adds watermark to the last page (if `watermark=true`)
3. Fixes PDF metadata for SignServer compatibility
4. Streams PDF to SignServer for signing
5. Returns signed PDF as stream

**Example using curl:**

```bash
curl -X POST \
  http://localhost:9999/signserver/process \
  -F "datafile=@document.pdf" \
  -F "workerName=6282336" \
  -F "watermark=true" \
  --output signed-document.pdf
```

**Example using JavaScript (Node.js):**

```javascript
const FormData = require("form-data");
const fs = require("fs");
const axios = require("axios");

const form = new FormData();
form.append("datafile", fs.createReadStream("document.pdf"));
form.append("workerName", "6282336");
form.append("watermark", "true");

try {
  const response = await axios.post(
    "http://localhost:9999/signserver/process",
    form,
    {
      headers: form.getHeaders(),
      responseType: "arraybuffer",
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    }
  );

  fs.writeFileSync("signed-document.pdf", response.data);
  console.log("PDF signed successfully");
} catch (error) {
  console.error("Error signing PDF:", error.response?.data || error.message);
}
```

**Example using Python:**

```python
import requests

url = 'http://localhost:9999/signserver/process'
files = {'datafile': open('document.pdf', 'rb')}
data = {
    'workerName': '6282336',
    'watermark': 'true'
}

response = requests.post(url, files=files, data=data)

if response.status_code == 200:
    with open('signed-document.pdf', 'wb') as f:
        f.write(response.content)
    print('PDF signed successfully')
else:
    print(f'Error: {response.status_code} - {response.text}')
```

**Example using fetch (Browser):**

```javascript
const formData = new FormData();
formData.append("datafile", fileInput.files[0]);
formData.append("workerName", "6282336");
formData.append("watermark", "true");

try {
  const response = await fetch("http://localhost:9999/signserver/process", {
    method: "POST",
    body: formData,
  });

  if (response.ok) {
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "signed-document.pdf";
    a.click();
  } else {
    const error = await response.json();
    console.error("Error:", error);
  }
} catch (error) {
  console.error("Network error:", error);
}
```

**Notes:**

- No file size limits (streaming processing)
- PDF is processed as a stream (memory efficient)
- Watermark is added to the last page, bottom right
- Watermark is clickable if URL is provided (requires watermark image configuration)
- Processing time depends on PDF size and SignServer performance

---

## Error Handling

### Error Response Format

All error responses follow this format:

```json
{
  "error": "Brief error message",
  "details": "Detailed error information (if available)"
}
```

### Common Error Scenarios

#### Missing Required Field

```json
{
  "error": "workerName field is required"
}
```

**Status:** `400 Bad Request`

#### No File Uploaded

```json
{
  "error": "No file uploaded. Please provide a 'datafile' in the FormData"
}
```

**Status:** `400 Bad Request`

#### FormData Parsing Error

```json
{
  "error": "Error parsing FormData",
  "details": "Error message details"
}
```

**Status:** `400 Bad Request`

#### SignServer Error

```json
{
  "error": "Failed to sign PDF",
  "details": "SignServer error message"
}
```

**Status:** `500 Internal Server Error`

#### Internal Server Error

```json
{
  "error": "Internal server error"
}
```

**Status:** `500 Internal Server Error`

---
