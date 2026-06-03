const crypto = require("crypto");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const { pipeline } = require("stream/promises");

const MAX_PROJECT_FILE_SIZE = 10 * 1024 * 1024;
const LOCAL_UPLOAD_ROOT = path.join(__dirname, "..", "..", "uploads");
const PROJECT_FILE_UPLOAD_DIR = path.join(LOCAL_UPLOAD_ROOT, "project-files");
const STORAGE_DRIVER_OPTIONS = ["local", "s3"];
const S3_PROJECT_FILE_PREFIX = "project-files";
const ALLOWED_FILE_EXTENSIONS = new Set([
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".txt",
  ".csv",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".zip"
]);
const DANGEROUS_FILE_EXTENSIONS = new Set([
  ".app",
  ".bat",
  ".bin",
  ".cmd",
  ".com",
  ".cpl",
  ".dll",
  ".dmg",
  ".exe",
  ".hta",
  ".jar",
  ".js",
  ".jse",
  ".msi",
  ".ps1",
  ".scr",
  ".sh",
  ".vb",
  ".vbe",
  ".vbs",
  ".wsf"
]);
const EXTENSION_MIME_TYPES = new Map([
  [".pdf", ["application/pdf"]],
  [".doc", ["application/msword", "application/octet-stream"]],
  [".docx", ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/zip", "application/octet-stream"]],
  [".xls", ["application/vnd.ms-excel", "application/octet-stream"]],
  [".xlsx", ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/zip", "application/octet-stream"]],
  [".ppt", ["application/vnd.ms-powerpoint", "application/octet-stream"]],
  [".pptx", ["application/vnd.openxmlformats-officedocument.presentationml.presentation", "application/zip", "application/octet-stream"]],
  [".txt", ["text/plain"]],
  [".csv", ["text/csv", "application/csv", "text/plain", "application/vnd.ms-excel"]],
  [".png", ["image/png"]],
  [".jpg", ["image/jpeg"]],
  [".jpeg", ["image/jpeg"]],
  [".webp", ["image/webp"]],
  [".zip", ["application/zip", "application/x-zip-compressed", "application/octet-stream"]]
]);

let s3Client = null;
let s3Dependencies = null;

function cleanText(value, maxLength = 2000) {
  return String(value || "").trim().slice(0, maxLength);
}

function getStorageDriver() {
  const configuredDriver = String(process.env.STORAGE_DRIVER || "local").trim().toLowerCase();
  return STORAGE_DRIVER_OPTIONS.includes(configuredDriver) ? configuredDriver : "local";
}

function parseBoolean(value, fallback = false) {
  if (typeof value === "undefined" || value === null || value === "") {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

function sanitizeFileName(value) {
  return cleanText(value, 255)
    .replace(/[\\/]/g, "-")
    .replace(/[^a-zA-Z0-9._ -]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getSafeDownloadFileName(value) {
  return sanitizeFileName(value || "project-file") || "project-file";
}

function getFileExtension(fileName) {
  return path.extname(fileName || "").toLowerCase();
}

function normalizeMimeType(value) {
  return cleanText(value, 120).toLowerCase();
}

function validateMimeType(fileName, mimeType, options = {}) {
  const normalizedMimeType = normalizeMimeType(mimeType);
  const extension = getFileExtension(fileName);

  if (!normalizedMimeType) {
    return options.requireMimeType ? "Uploaded files must include a MIME type." : "";
  }

  const allowedTypes = EXTENSION_MIME_TYPES.get(extension) || [];
  if (!allowedTypes.length || allowedTypes.includes(normalizedMimeType)) {
    return "";
  }

  return `MIME type ${normalizedMimeType} does not match the ${extension} file type.`;
}

function validateProjectFileName(fileName, options = {}) {
  const extension = getFileExtension(fileName);

  if (!fileName || !extension) {
    return "File name must include a supported extension.";
  }

  if (DANGEROUS_FILE_EXTENSIONS.has(extension)) {
    return "This file type is blocked for security reasons.";
  }

  if (!ALLOWED_FILE_EXTENSIONS.has(extension)) {
    return "Supported file types are PDF, Office documents, text, CSV, images, and ZIP archives.";
  }

  return validateMimeType(fileName, options.mimeType, {
    requireMimeType: Boolean(options.requireMimeType)
  });
}

function validateExternalFileUrl(fileUrl) {
  if (!fileUrl) {
    return "";
  }

  try {
    const parsedUrl = new URL(fileUrl);
    if (!["https:", "http:"].includes(parsedUrl.protocol)) {
      return "File link must use http or https.";
    }

    return "";
  } catch {
    return "File link must be a valid URL.";
  }
}

function getExternalFileName(fileUrl, fallbackTitle) {
  try {
    const parsedUrl = new URL(fileUrl);
    const baseName = path.basename(parsedUrl.pathname);
    return sanitizeFileName(baseName || fallbackTitle || "project-file");
  } catch {
    return sanitizeFileName(fallbackTitle || "project-file");
  }
}

function parseBase64File(value) {
  const content = cleanText(value, MAX_PROJECT_FILE_SIZE * 2);
  const dataUrlMatch = content.match(/^data:([^;]+);base64,(.+)$/);
  const base64Content = dataUrlMatch ? dataUrlMatch[2] : content;

  if (!base64Content) {
    return null;
  }

  try {
    return Buffer.from(base64Content, "base64");
  } catch {
    return null;
  }
}

function getS3Config() {
  return {
    endpoint: cleanText(process.env.S3_ENDPOINT, 500),
    region: cleanText(process.env.S3_REGION, 120),
    bucket: cleanText(process.env.S3_BUCKET, 200),
    accessKeyId: cleanText(process.env.S3_ACCESS_KEY_ID, 500),
    secretAccessKey: cleanText(process.env.S3_SECRET_ACCESS_KEY, 500),
    publicBaseUrl: cleanText(process.env.S3_PUBLIC_BASE_URL, 1000).replace(/\/+$/, ""),
    forcePathStyle: parseBoolean(process.env.S3_FORCE_PATH_STYLE)
  };
}

function validateS3Config(config = getS3Config()) {
  const missing = [];

  if (!config.bucket) {
    missing.push("S3_BUCKET");
  }

  if (!config.accessKeyId) {
    missing.push("S3_ACCESS_KEY_ID");
  }

  if (!config.secretAccessKey) {
    missing.push("S3_SECRET_ACCESS_KEY");
  }

  if (!config.region) {
    missing.push("S3_REGION");
  }

  if (missing.length) {
    return `STORAGE_DRIVER=s3 requires ${missing.join(", ")}.`;
  }

  if (config.publicBaseUrl) {
    try {
      const parsedPublicUrl = new URL(config.publicBaseUrl);
      if (!["https:", "http:"].includes(parsedPublicUrl.protocol)) {
        return "S3_PUBLIC_BASE_URL must use http or https.";
      }
    } catch {
      return "S3_PUBLIC_BASE_URL must be a valid URL.";
    }
  }

  return "";
}

function loadS3Dependencies() {
  if (!s3Dependencies) {
    s3Dependencies = require("@aws-sdk/client-s3");
  }

  return s3Dependencies;
}

function getS3Client(config = getS3Config()) {
  if (!s3Client) {
    const { S3Client } = loadS3Dependencies();
    const clientConfig = {
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey
      },
      forcePathStyle: config.forcePathStyle
    };

    if (config.endpoint) {
      clientConfig.endpoint = config.endpoint;
    }

    s3Client = new S3Client(clientConfig);
  }

  return s3Client;
}

function createS3ObjectKey(fileName) {
  const extension = getFileExtension(fileName);
  const now = new Date();
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const storedName = `${Date.now()}-${crypto.randomUUID()}${extension}`;

  return `${S3_PROJECT_FILE_PREFIX}/${year}/${month}/${storedName}`;
}

function normalizeS3ObjectKey(storagePath) {
  const key = cleanText(storagePath, 1000).replace(/\\/g, "/");

  if (
    !key ||
    key.startsWith("/") ||
    key.includes("\0") ||
    key.split("/").some((part) => !part || part === "." || part === "..")
  ) {
    return "";
  }

  return key;
}

function getPublicS3Url(config, key) {
  if (!config.publicBaseUrl) {
    return "";
  }

  return `${config.publicBaseUrl}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

async function saveLocalProjectFile({ buffer, fileName }) {
  await fsp.mkdir(PROJECT_FILE_UPLOAD_DIR, { recursive: true });

  const extension = getFileExtension(fileName);
  const storedName = `${Date.now()}-${crypto.randomUUID()}${extension}`;
  const absolutePath = path.join(PROJECT_FILE_UPLOAD_DIR, storedName);

  await fsp.writeFile(absolutePath, buffer, { flag: "wx" });

  return {
    storagePath: path.join("uploads", "project-files", storedName),
    storageDriver: "local"
  };
}

async function saveS3ProjectFile({ buffer, fileName, mimeType }) {
  const config = getS3Config();
  const configError = validateS3Config(config);

  if (configError) {
    return {
      errors: [configError],
      storagePath: "",
      storageDriver: "s3"
    };
  }

  const key = createS3ObjectKey(fileName);
  const { PutObjectCommand } = loadS3Dependencies();

  await getS3Client(config).send(new PutObjectCommand({
    Bucket: config.bucket,
    Key: key,
    Body: buffer,
    ContentType: normalizeMimeType(mimeType) || "application/octet-stream",
    ContentLength: buffer.length,
    Metadata: {
      originalFileName: getSafeDownloadFileName(fileName)
    }
  }));

  return {
    errors: [],
    storagePath: key,
    storageDriver: "s3"
  };
}

async function saveProjectFile({ fileContentBase64, fileName, mimeType }) {
  const buffer = parseBase64File(fileContentBase64);

  if (!buffer || !buffer.length) {
    return {
      errors: ["Uploaded file content is invalid."],
      storagePath: "",
      fileSize: 0,
      storageDriver: getStorageDriver()
    };
  }

  if (buffer.length > MAX_PROJECT_FILE_SIZE) {
    return {
      errors: ["Uploaded files must be 10 MB or smaller."],
      storagePath: "",
      fileSize: buffer.length,
      storageDriver: getStorageDriver()
    };
  }

  const fileNameError = validateProjectFileName(fileName, { mimeType });
  if (fileNameError) {
    return {
      errors: [fileNameError],
      storagePath: "",
      fileSize: buffer.length,
      storageDriver: getStorageDriver()
    };
  }

  // TODO: Add malware scanning before storing files in production.
  const result = getStorageDriver() === "local"
    ? await saveLocalProjectFile({ buffer, fileName })
    : await saveS3ProjectFile({ buffer, fileName, mimeType });

  return {
    errors: result.errors || [],
    storagePath: result.storagePath || "",
    storageDriver: result.storageDriver || getStorageDriver(),
    fileSize: buffer.length
  };
}

function resolveLocalStoragePath(storagePath) {
  const absolutePath = path.resolve(path.join(__dirname, "..", "..", storagePath || ""));
  const uploadRoot = path.resolve(LOCAL_UPLOAD_ROOT);

  if (!absolutePath.startsWith(`${uploadRoot}${path.sep}`)) {
    return null;
  }

  return absolutePath;
}

async function sendLocalProjectFile(res, file) {
  if (!file.storagePath) {
    return res.status(404).json({ message: "Stored file is unavailable." });
  }

  const absolutePath = resolveLocalStoragePath(file.storagePath);
  if (!absolutePath) {
    return res.status(403).json({ message: "Stored file path is not allowed." });
  }

  if (!fs.existsSync(absolutePath)) {
    return res.status(404).json({ message: "Stored file is unavailable." });
  }

  return res.download(absolutePath, file.fileName || "project-file");
}

async function sendS3ProjectFile(res, file) {
  const config = getS3Config();
  const configError = validateS3Config(config);

  if (configError) {
    return res.status(500).json({ message: "Stored file backend is not configured." });
  }

  const key = normalizeS3ObjectKey(file.storagePath);
  if (!key) {
    return res.status(403).json({ message: "Stored file path is not allowed." });
  }

  const publicUrl = getPublicS3Url(config, key);
  if (publicUrl) {
    return res.redirect(publicUrl);
  }

  const { GetObjectCommand } = loadS3Dependencies();
  let object;

  try {
    object = await getS3Client(config).send(new GetObjectCommand({
      Bucket: config.bucket,
      Key: key
    }));
  } catch (error) {
    if (error && (error.name === "NoSuchKey" || error.$metadata && error.$metadata.httpStatusCode === 404)) {
      return res.status(404).json({ message: "Stored file is unavailable." });
    }

    throw error;
  }

  if (!object.Body) {
    return res.status(404).json({ message: "Stored file is unavailable." });
  }

  res.setHeader("Content-Type", file.mimeType || object.ContentType || "application/octet-stream");
  if (object.ContentLength) {
    res.setHeader("Content-Length", String(object.ContentLength));
  }
  res.setHeader("Content-Disposition", `attachment; filename="${getSafeDownloadFileName(file.fileName)}"`);

  return pipeline(object.Body, res);
}

async function sendStoredProjectFile(res, file) {
  const storageDriver = file.storageDriver || "local";

  if (storageDriver === "s3") {
    return sendS3ProjectFile(res, file);
  }

  return sendLocalProjectFile(res, file);
}

module.exports = {
  ALLOWED_FILE_EXTENSIONS,
  DANGEROUS_FILE_EXTENSIONS,
  EXTENSION_MIME_TYPES,
  MAX_PROJECT_FILE_SIZE,
  getExternalFileName,
  getFileExtension,
  getS3Config,
  getStorageDriver,
  normalizeS3ObjectKey,
  parseBase64File,
  sanitizeFileName,
  saveProjectFile,
  sendStoredProjectFile,
  validateS3Config,
  validateExternalFileUrl,
  validateMimeType,
  validateProjectFileName
};
