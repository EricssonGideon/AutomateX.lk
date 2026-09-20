const crypto = require("node:crypto");

const {
  validateStagingLicensingConfig
} = require("../config/posLicensingProduction");

const STAGING_PUBLIC_KEY_PATH = "/internal/pos-licensing-staging-public-key";
const STAGING_PUBLIC_KEY_ID = "automatex-pos-staging-ed25519-v1";
const PUBLIC_JWK_X_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const NOT_FOUND_RESPONSE = Object.freeze({ message: "Not found." });
const UNAUTHORIZED_RESPONSE = Object.freeze({ message: "Unauthorized." });
const UNAVAILABLE_RESPONSE = Object.freeze({ message: "POS licensing public key is unavailable." });

function clean(value) {
  return String(value || "").trim();
}

function shouldMountStagingPublicKeyEndpoint(env = process.env) {
  return env.VERCEL === "1" &&
    clean(env.VERCEL_ENV).toLowerCase() === "preview" &&
    clean(env.VERCEL_GIT_COMMIT_REF) === "pos-licensing-staging" &&
    clean(env.AUTOMATEX_ENV).toLowerCase() === "staging" &&
    clean(env.POS_LICENSING_MODE).toLowerCase() === "staging" &&
    clean(env.POS_LICENSING_STAGING_PUBLIC_KEY_DIAGNOSTIC_ENABLED).toLowerCase() === "true" &&
    Boolean(clean(env.POS_LICENSING_STAGING_PUBLIC_KEY_DIAGNOSTIC_TOKEN));
}

function readBearerToken(req) {
  const authorization = req && typeof req.get === "function"
    ? req.get("authorization")
    : "";
  const match = /^Bearer ([^\s]+)$/i.exec(String(authorization || ""));
  return match ? match[1] : "";
}

function tokensMatch(candidate, expected) {
  if (!candidate || !expected) {
    return false;
  }
  const candidateDigest = crypto.createHash("sha256").update(candidate, "utf8").digest();
  const expectedDigest = crypto.createHash("sha256").update(expected, "utf8").digest();
  return crypto.timingSafeEqual(candidateDigest, expectedDigest);
}

function setNoStore(res) {
  res.set("Cache-Control", "no-store");
}

function createStagingPublicKeyHandler(options = {}) {
  const env = options.env || process.env;
  const validateConfig = options.validateConfig || validateStagingLicensingConfig;

  return async function stagingPublicKeyHandler(req, res) {
    setNoStore(res);
    if (!shouldMountStagingPublicKeyEndpoint(env)) {
      return res.status(404).json(NOT_FOUND_RESPONSE);
    }

    const bearerToken = readBearerToken(req);
    const expectedToken = clean(env.POS_LICENSING_STAGING_PUBLIC_KEY_DIAGNOSTIC_TOKEN);
    if (!tokensMatch(bearerToken, expectedToken)) {
      return res.status(401).json(UNAUTHORIZED_RESPONSE);
    }

    try {
      const config = validateConfig(env);
      if (
        !config ||
        config.environment !== "staging" ||
        config.keyId !== STAGING_PUBLIC_KEY_ID ||
        !config.keyProvider ||
        typeof config.keyProvider.getPublicKey !== "function"
      ) {
        return res.status(503).json(UNAVAILABLE_RESPONSE);
      }

      const publicKey = await config.keyProvider.getPublicKey();
      if (!publicKey || publicKey.type !== "public" || publicKey.asymmetricKeyType !== "ed25519") {
        return res.status(503).json(UNAVAILABLE_RESPONSE);
      }

      const publicJwk = publicKey.export({ format: "jwk" });
      if (
        !publicJwk ||
        publicJwk.kty !== "OKP" ||
        publicJwk.crv !== "Ed25519" ||
        typeof publicJwk.x !== "string" ||
        !PUBLIC_JWK_X_PATTERN.test(publicJwk.x) ||
        Object.prototype.hasOwnProperty.call(publicJwk, "d")
      ) {
        return res.status(503).json(UNAVAILABLE_RESPONSE);
      }

      return res.status(200).json({
        kty: publicJwk.kty,
        crv: publicJwk.crv,
        x: publicJwk.x,
        keyId: STAGING_PUBLIC_KEY_ID
      });
    } catch {
      return res.status(503).json(UNAVAILABLE_RESPONSE);
    }
  };
}

function mountStagingPublicKeyEndpoint(router, options = {}) {
  const env = options.env || process.env;
  if (!shouldMountStagingPublicKeyEndpoint(env)) {
    return false;
  }
  router.get(STAGING_PUBLIC_KEY_PATH, createStagingPublicKeyHandler({
    env,
    validateConfig: options.validateConfig
  }));
  return true;
}

module.exports = {
  STAGING_PUBLIC_KEY_ID,
  STAGING_PUBLIC_KEY_PATH,
  createStagingPublicKeyHandler,
  mountStagingPublicKeyEndpoint,
  shouldMountStagingPublicKeyEndpoint,
  tokensMatch
};
