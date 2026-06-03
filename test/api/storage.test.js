const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const test = require("node:test");

const {
  normalizeS3ObjectKey,
  parseBase64File,
  sanitizeFileName,
  saveProjectFile,
  validateS3Config,
  validateExternalFileUrl,
  validateProjectFileName
} = require("../../server/utils/storage");

test("storage validation blocks dangerous project file extensions", () => {
  assert.match(validateProjectFileName("invoice.exe", { mimeType: "application/octet-stream" }), /blocked/i);
  assert.match(validateProjectFileName("deploy.sh", { mimeType: "text/plain" }), /blocked/i);
});

test("storage validation blocks mismatched MIME types", () => {
  assert.match(validateProjectFileName("proposal.pdf", { mimeType: "text/javascript" }), /does not match/i);
});

test("storage validation accepts known safe file types", () => {
  assert.equal(validateProjectFileName("proposal.pdf", { mimeType: "application/pdf" }), "");
  assert.equal(validateProjectFileName("handover.csv", { mimeType: "text/csv" }), "");
});

test("external project file URLs must be valid http or https links", () => {
  assert.equal(validateExternalFileUrl("https://example.com/file.pdf"), "");
  assert.equal(validateExternalFileUrl("http://example.com/file.pdf"), "");
  assert.match(validateExternalFileUrl("ftp://example.com/file.pdf"), /http or https/i);
  assert.match(validateExternalFileUrl("javascript:alert(1)"), /http or https/i);
  assert.match(validateExternalFileUrl("not-a-url"), /valid URL/i);
});

test("file names are sanitized before persistence", () => {
  assert.equal(sanitizeFileName("../bad<script>.pdf"), "..-badscript.pdf");
});

test("base64 data URLs are parsed into buffers", () => {
  const buffer = parseBase64File("data:text/plain;base64,SGVsbG8=");

  assert.equal(Buffer.isBuffer(buffer), true);
  assert.equal(buffer.toString("utf8"), "Hello");
});

test("local storage driver saves project files under the upload directory", async () => {
  const previousDriver = process.env.STORAGE_DRIVER;
  process.env.STORAGE_DRIVER = "local";

  const result = await saveProjectFile({
    fileContentBase64: "data:text/plain;base64,SGVsbG8=",
    fileName: "handover.txt",
    mimeType: "text/plain"
  });

  try {
    assert.deepEqual(result.errors, []);
    assert.equal(result.storageDriver, "local");
    assert.match(result.storagePath, /^uploads[\\/]project-files[\\/].+\.txt$/);
    assert.equal(fs.existsSync(path.join(__dirname, "..", "..", result.storagePath)), true);
  } finally {
    if (result.storagePath) {
      fs.rmSync(path.join(__dirname, "..", "..", result.storagePath), { force: true });
    }

    if (typeof previousDriver === "undefined") {
      delete process.env.STORAGE_DRIVER;
    } else {
      process.env.STORAGE_DRIVER = previousDriver;
    }
  }
});

test("s3 storage driver rejects missing config clearly before upload", async () => {
  const previousEnv = {
    STORAGE_DRIVER: process.env.STORAGE_DRIVER,
    S3_REGION: process.env.S3_REGION,
    S3_BUCKET: process.env.S3_BUCKET,
    S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID,
    S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY
  };

  process.env.STORAGE_DRIVER = "s3";
  delete process.env.S3_REGION;
  delete process.env.S3_BUCKET;
  delete process.env.S3_ACCESS_KEY_ID;
  delete process.env.S3_SECRET_ACCESS_KEY;

  try {
    const result = await saveProjectFile({
      fileContentBase64: "data:text/plain;base64,SGVsbG8=",
      fileName: "handover.txt",
      mimeType: "text/plain"
    });

    assert.equal(result.storageDriver, "s3");
    assert.match(result.errors.join(" "), /S3_REGION/);
    assert.match(result.errors.join(" "), /S3_BUCKET/);
    assert.match(result.errors.join(" "), /S3_ACCESS_KEY_ID/);
    assert.match(result.errors.join(" "), /S3_SECRET_ACCESS_KEY/);
    assert.match(validateS3Config({
      region: "auto",
      bucket: "",
      accessKeyId: "",
      secretAccessKey: ""
    }), /STORAGE_DRIVER=s3 requires/);
  } finally {
    Object.entries(previousEnv).forEach(([key, value]) => {
      if (typeof value === "undefined") {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    });
  }
});

test("s3 object keys reject traversal and absolute paths", () => {
  assert.equal(normalizeS3ObjectKey("project-files/2026/06/file.pdf"), "project-files/2026/06/file.pdf");
  assert.equal(normalizeS3ObjectKey("../project-files/file.pdf"), "");
  assert.equal(normalizeS3ObjectKey("/project-files/file.pdf"), "");
  assert.equal(normalizeS3ObjectKey("project-files//file.pdf"), "");
});

test("s3 public base URL must be http or https when configured", () => {
  assert.match(validateS3Config({
    region: "auto",
    bucket: "bucket",
    accessKeyId: "key",
    secretAccessKey: "secret",
    publicBaseUrl: "ftp://example.com"
  }), /http or https/);
});
