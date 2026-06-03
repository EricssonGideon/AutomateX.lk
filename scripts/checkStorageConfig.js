#!/usr/bin/env node

const dotenv = require("dotenv");
const { HeadBucketCommand, S3Client } = require("@aws-sdk/client-s3");

dotenv.config();

const {
  getS3Config,
  getStorageDriver,
  validateS3Config
} = require("../server/utils/storage");

function parseBoolean(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

function printSetting(name, value, options = {}) {
  const isSet = Boolean(String(value || "").trim());

  if (options.secret) {
    console.log(`${name}: ${isSet ? "set" : "missing"}`);
    return;
  }

  console.log(`${name}: ${isSet ? value : "missing"}`);
}

async function runConnectivityTest(config) {
  const client = new S3Client({
    region: config.region,
    endpoint: config.endpoint || undefined,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey
    },
    forcePathStyle: config.forcePathStyle
  });

  await client.send(new HeadBucketCommand({
    Bucket: config.bucket
  }));
}

async function main() {
  const rawDriver = String(process.env.STORAGE_DRIVER || "local").trim().toLowerCase();
  const driver = getStorageDriver();
  const config = getS3Config();
  const configError = validateS3Config(config);
  const shouldTestConnectivity = parseBoolean(process.env.STORAGE_CONNECTIVITY_TEST);

  console.log("Storage configuration check");
  console.log(`STORAGE_DRIVER: ${driver}`);

  if (rawDriver && rawDriver !== driver) {
    console.warn(`Warning: unsupported STORAGE_DRIVER=${rawDriver}; application will use ${driver}.`);
  }

  if (driver === "local") {
    console.log("Local storage active. No S3/R2 credentials are required.");
    return;
  }

  printSetting("S3_ENDPOINT", config.endpoint);
  printSetting("S3_REGION", config.region);
  printSetting("S3_BUCKET", config.bucket);
  printSetting("S3_ACCESS_KEY_ID", config.accessKeyId, { secret: true });
  printSetting("S3_SECRET_ACCESS_KEY", config.secretAccessKey, { secret: true });
  console.log(`S3_FORCE_PATH_STYLE: ${config.forcePathStyle}`);
  console.log(`S3_PUBLIC_BASE_URL: ${config.publicBaseUrl ? "set" : "empty"}`);

  if (configError) {
    console.error(`Invalid storage configuration: ${configError}`);
    process.exitCode = 1;
    return;
  }

  if (config.endpoint.includes(".r2.cloudflarestorage.com")) {
    if (config.region !== "auto") {
      console.warn("Warning: Cloudflare R2 should use S3_REGION=auto.");
    }

    if (!config.forcePathStyle) {
      console.warn("Warning: Cloudflare R2 should use S3_FORCE_PATH_STYLE=true.");
    }
  }

  console.log("Required S3 storage configuration is present.");

  if (!shouldTestConnectivity) {
    console.log("Connectivity test skipped. Set STORAGE_CONNECTIVITY_TEST=true to run a live bucket check.");
    return;
  }

  try {
    await runConnectivityTest(config);
    console.log("Connectivity test passed: bucket is reachable.");
  } catch (error) {
    console.error(`Connectivity test failed: ${error.message}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`Storage configuration check failed: ${error.message}`);
  process.exitCode = 1;
});
