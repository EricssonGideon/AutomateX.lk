const fs = require("node:fs");

const SECRET_CATEGORIES = Object.freeze({
  ED25519_PRIVATE_JWK: "ed25519_private_jwk",
  MONGODB_CREDENTIALS: "mongodb_credentials",
  RATE_LIMITER_CREDENTIALS: "rate_limiter_credentials",
  AUTHORIZATION_TOKEN: "authorization_token",
  RAW_RENEWAL_CREDENTIAL: "raw_renewal_credential"
});

function looksLikePlaceholder(value) {
  const text = String(value || "").trim();
  return !text || /^(?:<.*>|\[.*\]|\.\.\.|replace[-_ ]with|dummy|example|test-only)/i.test(text) || /(?:your[-_]|user(?:name)?|pass(?:word)?)/i.test(text);
}

function hasCredentialUri(text, pattern) {
  let match = pattern.exec(text);
  while (match) {
    if (!looksLikePlaceholder(match[1]) || !looksLikePlaceholder(match[2])) {
      return true;
    }
    match = pattern.exec(text);
  }
  return false;
}

function hasEncodedPrivateJwk(text) {
  return text.split(/\r?\n/).some((line) => {
    const match = line.match(/^\s*(?:#\s*)?POS_LICENSING_SIGNING_PRIVATE_JWK_B64\s*=\s*(\S+)\s*$/);
    if (!match || looksLikePlaceholder(match[1])) {
      return false;
    }
    try {
      const jwk = JSON.parse(Buffer.from(match[1], "base64").toString("utf8"));
      return jwk && jwk.kty === "OKP" && jwk.crv === "Ed25519" && typeof jwk.d === "string" && jwk.d.length >= 32;
    } catch {
      return false;
    }
  });
}

function scanTextForPosSecrets(file, content) {
  const text = String(content || "");
  const categories = new Set();

  const hasPrivateJwkShape = /["']kty["']\s*:\s*["']OKP["']/i.test(text) &&
    /["']crv["']\s*:\s*["']Ed25519["']/i.test(text) &&
    /["']d["']\s*:\s*["'][A-Za-z0-9_-]{32,}["']/i.test(text);
  if (hasPrivateJwkShape || hasEncodedPrivateJwk(text)) {
    categories.add(SECRET_CATEGORIES.ED25519_PRIVATE_JWK);
  }
  if (hasCredentialUri(text, /\bmongodb(?:\+srv)?:\/\/([^\s/:@"'<>]+):([^\s/@"'<>]+)@/gi)) {
    categories.add(SECRET_CATEGORIES.MONGODB_CREDENTIALS);
  }
  if (
    hasCredentialUri(text, /\brediss?:\/\/([^\s/:@"'<>]+):([^\s/@"'<>]+)@/gi) ||
    /(?:POS_LICENSING_RATE_LIMIT_(?:PASSWORD|TOKEN)|UPSTASH_REDIS_REST_TOKEN)\s*=\s*[A-Za-z0-9._~+/=-]{24,}/i.test(text)
  ) {
    categories.add(SECRET_CATEGORIES.RATE_LIMITER_CREDENTIALS);
  }
  if (/\bBearer\s+[A-Za-z0-9._~+/=-]{32,}/i.test(text)) {
    categories.add(SECRET_CATEGORIES.AUTHORIZATION_TOKEN);
  }
  if (/\bposrc_[A-Za-z0-9_-]{24,}/.test(text)) {
    categories.add(SECRET_CATEGORIES.RAW_RENEWAL_CREDENTIAL);
  }

  return [...categories].sort().map((category) => Object.freeze({ file, category }));
}

function scanFilesForPosSecrets(files) {
  return files.flatMap((file) => {
    const content = fs.readFileSync(file);
    if (content.includes(0)) {
      return [];
    }
    return scanTextForPosSecrets(file, content.toString("utf8"));
  });
}

function summarizeSecretScan(findings, rootDirectory = process.cwd()) {
  const byFile = new Map();
  findings.forEach((finding) => {
    const relativeFile = require("node:path").relative(rootDirectory, finding.file) || finding.file;
    if (!byFile.has(relativeFile)) {
      byFile.set(relativeFile, new Set());
    }
    byFile.get(relativeFile).add(finding.category);
  });
  return [...byFile.entries()].map(([file, categories]) => ({
    file,
    categories: [...categories].sort()
  }));
}

module.exports = {
  SECRET_CATEGORIES,
  scanFilesForPosSecrets,
  scanTextForPosSecrets,
  summarizeSecretScan
};
