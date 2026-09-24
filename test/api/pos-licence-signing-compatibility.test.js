const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const mongoose = require("mongoose");

const PosInstallation = require("../../server/models/PosInstallation");
const PosLicence = require("../../server/models/PosLicence");
const PosPackage = require("../../server/models/PosPackage");
const {
  POS_EDITION_STANDARD,
  POS_STANDARD_MANDATORY_MODULE_IDS,
  POS_STANDARD_MODULE_IDS,
  getStandardLicenceSignatureData
} = require("../../server/utils/posLicenceContract");
const {
  PosLicenceSigningError,
  buildAndSignStandardLicencePayload,
  buildStandardSignedLicencePayload,
  signStandardLicencePayload
} = require("../../server/utils/posLicenceSigning");

const POS_STANDARD_SOURCE_PATH = "/Users/robertericsson/AutomateX/Systems/AutomateX POS Systems/POS-Standard Original/app.js";
const TRUST_BOUNDARY_SOURCE = "const STANDARD_PRODUCTION_LICENCE_PUBLIC_KEY_JWK = null;";
const CLIENT_ID = new mongoose.Types.ObjectId();
const PROJECT_ID = new mongoose.Types.ObjectId();
const PACKAGE_ID = new mongoose.Types.ObjectId();
const LICENCE_ID = new mongoose.Types.ObjectId();
const DEVICE_INSTALLATION_ID = "123e4567-e89b-42d3-a456-426614174000";
const ISSUED_AT = "2026-08-31T00:00:00.000Z";
const LICENCE_EXPIRY = "2026-10-30T00:00:00.000Z";
const SUPPORT_EXPIRY = "2026-11-29T00:00:00.000Z";
const OFFLINE_VALID_UNTIL = "2026-09-14T00:00:00.000Z";
const TEST_SIGNING_KEY_ID = "automatex-pos-prod-ed25519-v1";

function generateEphemeralKeyPair() {
  return crypto.generateKeyPairSync("ed25519");
}

function createKeyProvider(privateKey, keyId = TEST_SIGNING_KEY_ID) {
  return {
    keyId,
    async getPrivateKey() {
      return privateKey;
    }
  };
}

function buildPackage(overrides = {}) {
  return new PosPackage({
    _id: PACKAGE_ID,
    packageCode: "standard-signing",
    name: "Signing Standard Package",
    edition: POS_EDITION_STANDARD,
    status: "active",
    moduleIds: [...POS_STANDARD_MODULE_IDS],
    updateChannels: ["stable", "beta"],
    ...overrides
  });
}

function buildLicence(overrides = {}) {
  return new PosLicence({
    _id: LICENCE_ID,
    clientId: CLIENT_ID,
    projectId: PROJECT_ID,
    packageId: PACKAGE_ID,
    edition: POS_EDITION_STANDARD,
    status: "active",
    entitledModules: [...POS_STANDARD_MANDATORY_MODULE_IDS, "reports"],
    updateChannel: "stable",
    licenceExpiry: LICENCE_EXPIRY,
    supportExpiry: SUPPORT_EXPIRY,
    ...overrides
  });
}

function buildInstallation(overrides = {}) {
  return new PosInstallation({
    _id: new mongoose.Types.ObjectId(),
    licenceId: LICENCE_ID,
    deviceInstallationId: DEVICE_INSTALLATION_ID,
    status: "pending",
    ...overrides
  });
}

function buildRecords(overrides = {}) {
  return {
    licence: buildLicence(overrides.licence),
    posPackage: buildPackage(overrides.posPackage),
    installation: buildInstallation(overrides.installation),
    issuedAt: overrides.issuedAt || ISSUED_AT,
    offlineValidUntil: overrides.offlineValidUntil || OFFLINE_VALID_UNTIL,
    keyId: overrides.keyId || TEST_SIGNING_KEY_ID
  };
}

function makeElement(ElementClass) {
  const element = Object.create(ElementClass.prototype);
  return Object.assign(element, {
    style: {},
    dataset: {},
    value: "",
    textContent: "",
    innerHTML: "",
    checked: false,
    disabled: false,
    classList: {
      add() {},
      remove() {},
      toggle() {},
      contains() {
        return false;
      }
    },
    append() {},
    appendChild() {},
    prepend() {},
    remove() {},
    setAttribute() {},
    removeAttribute() {},
    addEventListener() {},
    removeEventListener() {},
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    closest() {
      return null;
    },
    focus() {},
    blur() {}
  });
}

function createStorage() {
  const entries = new Map();
  return {
    getItem(key) {
      return entries.has(key) ? entries.get(key) : null;
    },
    setItem(key, value) {
      entries.set(key, String(value));
    },
    removeItem(key) {
      entries.delete(key);
    },
    entries
  };
}

function createPosVmContext() {
  function FakeHTMLElement() {}
  class FixedDate extends Date {
    constructor(...args) {
      super(args.length ? args[0] : "2026-09-01T00:00:00.000Z");
    }

    static now() {
      return new Date("2026-09-01T00:00:00.000Z").getTime();
    }
  }
  const storage = createStorage();
  const noop = () => {};
  const document = {
    addEventListener() {},
    removeEventListener() {},
    getElementById() {
      return makeElement(FakeHTMLElement);
    },
    querySelector() {
      return makeElement(FakeHTMLElement);
    },
    querySelectorAll() {
      return [];
    },
    body: makeElement(FakeHTMLElement),
    documentElement: makeElement(FakeHTMLElement),
    createElement() {
      return makeElement(FakeHTMLElement);
    }
  };
  const context = {
    console: {
      log() {},
      info() {},
      warn() {},
      error() {}
    },
    setTimeout() {
      return 0;
    },
    clearTimeout: noop,
    setInterval() {
      return 0;
    },
    clearInterval: noop,
    requestAnimationFrame() {
      return 0;
    },
    cancelAnimationFrame: noop,
    TextEncoder,
    TextDecoder,
    URL,
    Date: FixedDate,
    JSON,
    Array,
    Object,
    String,
    Number,
    Boolean,
    RegExp,
    Error,
    Promise,
    Map,
    Set,
    Uint8Array,
    AbortController,
    crypto: globalThis.crypto,
    btoa(value) {
      return Buffer.from(value, "binary").toString("base64");
    },
    atob(value) {
      return Buffer.from(value, "base64").toString("binary");
    },
    navigator: {
      onLine: true,
      userAgent: "automatex-pos-compatibility-test"
    },
    localStorage: storage,
    sessionStorage: createStorage(),
    document,
    HTMLElement: FakeHTMLElement,
    HTMLInputElement: FakeHTMLElement,
    HTMLFormElement: FakeHTMLElement,
    HTMLButtonElement: FakeHTMLElement,
    Event: function Event() {},
    CustomEvent: function CustomEvent() {},
    location: {
      protocol: "https:",
      href: "https://pos-compatibility.example.test/"
    },
    addEventListener: noop,
    removeEventListener: noop,
    dispatchEvent: noop,
    matchMedia() {
      return {
        matches: false,
        addEventListener: noop,
        removeEventListener: noop
      };
    },
    window: null,
    self: null
  };
  context.window = context;
  context.self = context;
  return context;
}

function loadActualPosVerifier(publicJwk) {
  assert.ok(fs.existsSync(POS_STANDARD_SOURCE_PATH), "POS Standard source must be available for compatibility testing.");
  const source = fs.readFileSync(POS_STANDARD_SOURCE_PATH, "utf8");
  assert.match(source, /function normalizeStandardSignedLicencePayload/);
  assert.match(source, /function verifyStandardSignedLicencePayload/);
  assert.match(source, /function normalizeStandardActivationResponsePayload/);
  assert.match(source, /function requestStandardPosActivation/);
  assert.equal(source.includes(TRUST_BOUNDARY_SOURCE), true, "POS public-key trust boundary has drifted.");

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "automatex-pos-verifier-copy-"));
  const tempFile = path.join(tempDir, "app.js");
  const copiedSource = source.replace(
    TRUST_BOUNDARY_SOURCE,
    `const STANDARD_PRODUCTION_LICENCE_PUBLIC_KEY_JWK = ${JSON.stringify(publicJwk)};`
  ) + `
;window.__posExports = {
  verifyStandardSignedLicencePayload,
  normalizeStandardActivationResponsePayload,
  getStandardOfflineLicenceStatus,
  requestStandardPosActivation,
  createStandardActivationRequestPayload,
  createStandardInternalLicenceVerificationOptions,
  getStandardLicenceSignatureData,
  normalizeStandardSignedLicencePayload
};`;
  fs.writeFileSync(tempFile, copiedSource);

  const context = createPosVmContext();
  try {
    vm.runInNewContext(fs.readFileSync(tempFile, "utf8"), context, {
      filename: tempFile,
      timeout: 5000
    });
    return {
      exports: context.__posExports,
      context,
      tempDir,
      cleanup() {
        if (tempDir.startsWith(path.join(os.tmpdir(), "automatex-pos-verifier-copy-"))) {
          fs.rmSync(tempDir, { recursive: true, force: true });
        }
      }
    };
  } catch (error) {
    if (tempDir.startsWith(path.join(os.tmpdir(), "automatex-pos-verifier-copy-"))) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    throw error;
  }
}

async function assertPosRejects(fn, pattern) {
  try {
    await fn();
  } catch (error) {
    assert.match(String(error && error.message || error), pattern);
    return;
  }
  assert.fail(`Expected POS verifier to reject with ${pattern}.`);
}

function mutateSignedPayload(payload, changes) {
  return {
    ...payload,
    ...changes
  };
}

function seedPosInstallationIdentity(pos, deviceInstallationId = DEVICE_INSTALLATION_ID) {
  pos.context.localStorage.setItem("automatex-pos-standard-device-identity-v1", JSON.stringify({
    schemaVersion: 1,
    deviceInstallationId,
    createdAt: ISSUED_AT
  }));
  pos.context.localStorage.setItem("automatex-pos-standard-installation-v1", JSON.stringify({
    schemaVersion: 1,
    status: "pending",
    createdAt: ISSUED_AT,
    completedAt: null,
    source: "fresh"
  }));
}

test("server signing helper builds only the POS Standard signed response fields", async () => {
  const { privateKey, publicKey } = generateEphemeralKeyPair();
  const unsignedPayload = buildStandardSignedLicencePayload(buildRecords());
  assert.deepEqual(Object.keys(unsignedPayload), [
    "schemaVersion",
    "clientId",
    "installationId",
    "edition",
    "licenceStatus",
    "licenceExpiry",
    "enabledModules",
    "updateChannel",
    "supportExpiry",
    "issuedAt",
    "offlineValidUntil",
    "keyId",
    "signature"
  ]);
  assert.equal(unsignedPayload.signature, "");
  assert.equal(unsignedPayload.schemaVersion, 1);
  assert.equal(unsignedPayload.edition, "standard");
  assert.equal(unsignedPayload.licenceStatus, "active");
  assert.deepEqual(
    unsignedPayload.enabledModules,
    POS_STANDARD_MODULE_IDS.filter((moduleId) => new Set([...POS_STANDARD_MANDATORY_MODULE_IDS, "reports"]).has(moduleId))
  );
  assert.equal(unsignedPayload.installationId, DEVICE_INSTALLATION_ID);
  assert.equal(unsignedPayload.issuedAt, ISSUED_AT);
  assert.equal(unsignedPayload.offlineValidUntil, OFFLINE_VALID_UNTIL);
  assert.equal(unsignedPayload.keyId, TEST_SIGNING_KEY_ID);

  const signedPayload = await signStandardLicencePayload(unsignedPayload, createKeyProvider(privateKey));
  assert.match(signedPayload.signature, /^[A-Za-z0-9+/]+={0,2}$/);
  assert.equal(
    crypto.verify(
      null,
      Buffer.from(getStandardLicenceSignatureData(signedPayload), "utf8"),
      publicKey,
      Buffer.from(signedPayload.signature, "base64")
    ),
    true
  );
  assert.match(getStandardLicenceSignatureData(signedPayload), /"keyId":"automatex-pos-prod-ed25519-v1"/);
  assert.equal(
    crypto.verify(
      null,
      Buffer.from(getStandardLicenceSignatureData({ ...signedPayload, keyId: "automatex-pos-prod-ed25519-v2" }), "utf8"),
      publicKey,
      Buffer.from(signedPayload.signature, "base64")
    ),
    false
  );
});

test("server signing helper takes keyId from the configured signing provider", async () => {
  const { privateKey } = generateEphemeralKeyPair();
  const configuredKeyId = "automatex-pos-staging-ed25519-v1";
  const records = buildRecords({ keyId: configuredKeyId });
  const signedPayload = await buildAndSignStandardLicencePayload(records, createKeyProvider(privateKey, configuredKeyId));

  assert.equal(signedPayload.keyId, configuredKeyId);
  await assert.rejects(
    () => signStandardLicencePayload(signedPayload, createKeyProvider(privateKey, "different-provider-key")),
    (error) => error instanceof PosLicenceSigningError && error.code === "signing_key_mismatch"
  );
});

test("server signing helper fails closed for missing or invalid keys and ineligible records", async () => {
  const unsignedPayload = buildStandardSignedLicencePayload(buildRecords());
  await assert.rejects(
    () => signStandardLicencePayload(unsignedPayload, null),
    (error) => error instanceof PosLicenceSigningError && error.code === "signing_key_unavailable"
  );
  await assert.rejects(
    () => signStandardLicencePayload(unsignedPayload, createKeyProvider(null)),
    (error) => error instanceof PosLicenceSigningError && error.code === "signing_key_unavailable"
  );
  await assert.rejects(
    () => signStandardLicencePayload(unsignedPayload, { async getPrivateKey() { return generateEphemeralKeyPair().privateKey; } }),
    (error) => error instanceof PosLicenceSigningError && error.code === "signing_key_invalid"
  );
  const rsaKey = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey;
  await assert.rejects(
    () => signStandardLicencePayload(unsignedPayload, createKeyProvider(rsaKey)),
    (error) => error instanceof PosLicenceSigningError && error.code === "signing_key_invalid"
  );

  assert.throws(
    () => buildStandardSignedLicencePayload(buildRecords({ licence: { status: "draft" } })),
    (error) => error instanceof PosLicenceSigningError && error.code === "licence_not_approved"
  );
  assert.throws(
    () => buildStandardSignedLicencePayload(buildRecords({ posPackage: { status: "draft" } })),
    (error) => error instanceof PosLicenceSigningError && error.code === "package_not_published"
  );
  assert.throws(
    () => buildStandardSignedLicencePayload(buildRecords({ installation: { status: "revoked" } })),
    (error) => error instanceof PosLicenceSigningError && error.code === "installation_not_signable"
  );
  assert.throws(
    () => buildStandardSignedLicencePayload(buildRecords({ installation: { licenceId: new mongoose.Types.ObjectId() } })),
    (error) => error instanceof PosLicenceSigningError && error.code === "installation_mismatch"
  );
});

test("server signing helper rejects invalid offline validity windows without extending licence expiry", () => {
  assert.throws(
    () => buildStandardSignedLicencePayload(buildRecords({ offlineValidUntil: ISSUED_AT })),
    (error) => error instanceof PosLicenceSigningError && error.code === "invalid_offline_window"
  );
  assert.throws(
    () => buildStandardSignedLicencePayload(buildRecords({ offlineValidUntil: "2026-12-01T00:00:00.000Z" })),
    (error) => error instanceof PosLicenceSigningError && error.code === "invalid_offline_window"
  );
  assert.throws(
    () => buildStandardSignedLicencePayload(buildRecords({ issuedAt: "2026-11-01T00:00:00.000Z" })),
    (error) => error instanceof PosLicenceSigningError && error.code === "invalid_offline_window"
  );
});

test("Company System signed payload is accepted by the actual POS verifier and activation response path", async () => {
  const { privateKey, publicKey } = generateEphemeralKeyPair();
  const pos = loadActualPosVerifier(publicKey.export({ format: "jwk" }));
  try {
    const signedPayload = await buildAndSignStandardLicencePayload(buildRecords(), createKeyProvider(privateKey));
    seedPosInstallationIdentity(pos);
    const verified = await pos.exports.verifyStandardSignedLicencePayload(signedPayload, pos.exports.createStandardInternalLicenceVerificationOptions({
      expectedInstallationId: DEVICE_INSTALLATION_ID,
      now: "2026-09-01T00:00:00.000Z"
    }));
    assert.equal(verified.installationId, DEVICE_INSTALLATION_ID);
    assert.deepEqual(verified.enabledModules, signedPayload.enabledModules);

    const responsePayload = pos.exports.normalizeStandardActivationResponsePayload(signedPayload);
    assert.equal(responsePayload.signature, signedPayload.signature);

    let activationRequest = null;
    const activationResult = await pos.exports.requestStandardPosActivation({
      activationCode: "posac_activation_compatibility",
      endpoint: "https://licensing.example.test/activate",
      timeoutMs: 1000,
      fetchFn: async (_endpoint, request) => {
        activationRequest = JSON.parse(request.body);
        return {
          ok: true,
          status: 200,
          async json() {
            return signedPayload;
          }
        };
      }
    });
    assert.equal(activationResult.ok, true);
    assert.equal(activationRequest.schemaVersion, 1);
    assert.equal(activationRequest.edition, "standard");
    assert.equal(activationRequest.deviceInstallationId, DEVICE_INSTALLATION_ID);
    assert.equal(activationResult.provider.installationId, DEVICE_INSTALLATION_ID);
  } finally {
    pos.cleanup();
  }
});

test("actual POS verifier rejects tampering, wrong key, wrong destination and contract drift cases", async () => {
  const { privateKey, publicKey } = generateEphemeralKeyPair();
  const wrongKeyPair = generateEphemeralKeyPair();
  const signedPayload = await buildAndSignStandardLicencePayload(buildRecords(), createKeyProvider(privateKey));
  const pos = loadActualPosVerifier(publicKey.export({ format: "jwk" }));
  const wrongKeyPos = loadActualPosVerifier(wrongKeyPair.publicKey.export({ format: "jwk" }));
  try {
    seedPosInstallationIdentity(pos);
    await assertPosRejects(
      () => pos.exports.verifyStandardSignedLicencePayload(mutateSignedPayload(signedPayload, {
        enabledModules: [...signedPayload.enabledModules, "staff"]
      }), pos.exports.createStandardInternalLicenceVerificationOptions({
        expectedInstallationId: DEVICE_INSTALLATION_ID,
        now: "2026-09-01T00:00:00.000Z"
      })),
      /signature could not be verified/
    );
    await assertPosRejects(
      () => pos.exports.verifyStandardSignedLicencePayload(mutateSignedPayload(signedPayload, {
        licenceExpiry: "2026-09-30T00:00:00.000Z"
      }), pos.exports.createStandardInternalLicenceVerificationOptions({
        expectedInstallationId: DEVICE_INSTALLATION_ID,
        now: "2026-09-01T00:00:00.000Z"
      })),
      /signature could not be verified/
    );
    await assertPosRejects(
      () => pos.exports.verifyStandardSignedLicencePayload(mutateSignedPayload(signedPayload, {
        clientId: "different-client"
      }), pos.exports.createStandardInternalLicenceVerificationOptions({
        expectedInstallationId: DEVICE_INSTALLATION_ID,
        now: "2026-09-01T00:00:00.000Z"
      })),
      /signature could not be verified/
    );
    await assertPosRejects(
      () => pos.exports.verifyStandardSignedLicencePayload(mutateSignedPayload(signedPayload, {
        keyId: "automatex-pos-prod-ed25519-v2"
      }), pos.exports.createStandardInternalLicenceVerificationOptions({
        expectedInstallationId: DEVICE_INSTALLATION_ID,
        now: "2026-09-01T00:00:00.000Z",
        trustedProductionPublicKeys: {
          "automatex-pos-prod-ed25519-v2": publicKey.export({ format: "jwk" })
        }
      })),
      /signature could not be verified/
    );
    await assertPosRejects(
      () => pos.exports.verifyStandardSignedLicencePayload(mutateSignedPayload(signedPayload, {
        installationId: "different-installation"
      }), pos.exports.createStandardInternalLicenceVerificationOptions({
        expectedInstallationId: DEVICE_INSTALLATION_ID,
        now: "2026-09-01T00:00:00.000Z"
      })),
      /installation id does not match/
    );
    await assertPosRejects(
      () => pos.exports.verifyStandardSignedLicencePayload(mutateSignedPayload(signedPayload, {
        signature: `${signedPayload.signature.slice(0, -2)}AA`
      }), pos.exports.createStandardInternalLicenceVerificationOptions({
        expectedInstallationId: DEVICE_INSTALLATION_ID,
        now: "2026-09-01T00:00:00.000Z"
      })),
      /signature could not be verified/
    );
    await assertPosRejects(
      () => wrongKeyPos.exports.verifyStandardSignedLicencePayload(signedPayload, wrongKeyPos.exports.createStandardInternalLicenceVerificationOptions({
        expectedInstallationId: DEVICE_INSTALLATION_ID,
        now: "2026-09-01T00:00:00.000Z"
      })),
      /signature could not be verified/
    );
    await assertPosRejects(
      () => pos.exports.verifyStandardSignedLicencePayload(signedPayload, pos.exports.createStandardInternalLicenceVerificationOptions({
        expectedInstallationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        now: "2026-09-01T00:00:00.000Z"
      })),
      /installation id does not match/
    );
    await assertPosRejects(
      () => pos.exports.normalizeStandardActivationResponsePayload({ ...signedPayload, unsupportedField: "internal-value" }),
      /Activation response was invalid/
    );
    const missingSignature = { ...signedPayload };
    delete missingSignature.signature;
    await assertPosRejects(
      () => pos.exports.normalizeStandardActivationResponsePayload(missingSignature),
      /Activation response was invalid/
    );
    await assertPosRejects(
      () => pos.exports.normalizeStandardActivationResponsePayload({ ...signedPayload, enabledModules: "reports" }),
      /enabled modules are invalid/
    );
  } finally {
    pos.cleanup();
    wrongKeyPos.cleanup();
  }
});

test("actual POS validity checks distinguish licence expiry and offline-window expiry", async () => {
  const { privateKey, publicKey } = generateEphemeralKeyPair();
  const pos = loadActualPosVerifier(publicKey.export({ format: "jwk" }));
  try {
    seedPosInstallationIdentity(pos);
    const expiredLicence = await buildAndSignStandardLicencePayload(
      buildRecords({
        licence: {
          licenceExpiry: "2026-09-01T00:00:00.000Z"
        },
        offlineValidUntil: "2026-09-01T00:00:00.000Z"
      }),
      createKeyProvider(privateKey)
    );
    const expiredLicenceStatus = await pos.exports.getStandardOfflineLicenceStatus(pos.exports.createStandardInternalLicenceVerificationOptions({
      licencePayload: expiredLicence,
      expectedInstallationId: DEVICE_INSTALLATION_ID,
      now: "2026-09-02T00:00:00.000Z",
      isOnline: true
    }));
    assert.equal(expiredLicenceStatus.status, "expired");
    assert.match(expiredLicenceStatus.reason, /Licence expiry date/);

    const expiredOfflineWindow = await buildAndSignStandardLicencePayload(
      buildRecords({
        offlineValidUntil: "2026-09-01T00:00:00.000Z"
      }),
      createKeyProvider(privateKey)
    );
    const expiredOfflineOnline = await pos.exports.getStandardOfflineLicenceStatus(pos.exports.createStandardInternalLicenceVerificationOptions({
      licencePayload: expiredOfflineWindow,
      expectedInstallationId: DEVICE_INSTALLATION_ID,
      now: "2026-09-02T00:00:00.000Z",
      isOnline: true
    }));
    assert.equal(expiredOfflineOnline.status, "expired");
    assert.match(expiredOfflineOnline.reason, /Offline licence window/);

    const expiredOfflineOffline = await pos.exports.getStandardOfflineLicenceStatus(pos.exports.createStandardInternalLicenceVerificationOptions({
      licencePayload: expiredOfflineWindow,
      expectedInstallationId: DEVICE_INSTALLATION_ID,
      now: "2026-09-02T00:00:00.000Z",
      isOnline: false
    }));
    assert.equal(expiredOfflineOffline.status, "expired");
    assert.match(expiredOfflineOffline.reason, /Offline licence window/);
  } finally {
    pos.cleanup();
  }
});

test("actual POS canonicalization preserves array order and permits safe non-ASCII identifiers", async () => {
  const { privateKey, publicKey } = generateEphemeralKeyPair();
  const pos = loadActualPosVerifier(publicKey.export({ format: "jwk" }));
  try {
    const nonAsciiPayload = await buildAndSignStandardLicencePayload(
      {
        licence: {
          _id: String(LICENCE_ID),
          clientId: "client-ae-åäö",
          projectId: String(PROJECT_ID),
          packageId: String(PACKAGE_ID),
          edition: POS_EDITION_STANDARD,
          status: "active",
          entitledModules: [...POS_STANDARD_MANDATORY_MODULE_IDS, "reports"],
          updateChannel: "stable",
          licenceExpiry: LICENCE_EXPIRY,
          supportExpiry: SUPPORT_EXPIRY
        },
        posPackage: {
          _id: String(PACKAGE_ID),
          packageCode: "standard-signing",
          name: "Signing Standard Package",
          edition: POS_EDITION_STANDARD,
          status: "active",
          moduleIds: [...POS_STANDARD_MODULE_IDS],
          updateChannels: ["stable", "beta"]
        },
        installation: {
          licenceId: String(LICENCE_ID),
          deviceInstallationId: DEVICE_INSTALLATION_ID,
          status: "pending"
        },
        issuedAt: ISSUED_AT,
        offlineValidUntil: OFFLINE_VALID_UNTIL
      },
      createKeyProvider(privateKey)
    );
    const verifiedNonAscii = await pos.exports.verifyStandardSignedLicencePayload(nonAsciiPayload, pos.exports.createStandardInternalLicenceVerificationOptions({
      expectedInstallationId: DEVICE_INSTALLATION_ID,
      now: "2026-09-01T00:00:00.000Z"
    }));
    assert.equal(verifiedNonAscii.clientId, "client-ae-åäö");

    const reorderedModules = {
      ...nonAsciiPayload,
      enabledModules: [...nonAsciiPayload.enabledModules].reverse()
    };
    await assertPosRejects(
      () => pos.exports.verifyStandardSignedLicencePayload(reorderedModules, pos.exports.createStandardInternalLicenceVerificationOptions({
        expectedInstallationId: DEVICE_INSTALLATION_ID,
        now: "2026-09-01T00:00:00.000Z"
      })),
      /signature could not be verified/
    );
    assert.notEqual(
      pos.exports.getStandardLicenceSignatureData(nonAsciiPayload),
      pos.exports.getStandardLicenceSignatureData(reorderedModules)
    );
  } finally {
    pos.cleanup();
  }
});

test("signing component remains absent from production startup, routes, UI, and public assets", () => {
  const rootDir = path.join(__dirname, "..", "..");
  for (const relativePath of [
    "server.js",
    "server/server.js",
    "server/routes/index.js",
    "server/routes/posLicenceAdmin.js",
    "server/controllers/posLicenceAdminController.js",
    "tools/pos-licence-admin-ui/pos-licence-admin-ui.js"
  ]) {
    const source = fs.readFileSync(path.join(rootDir, relativePath), "utf8");
    assert.doesNotMatch(source, /posLicenceSigning|buildAndSignStandardLicencePayload|signStandardLicencePayload/);
  }

  const publicMatches = [];
  function scanPublic(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        scanPublic(fullPath);
      } else if (/\.(js|html|css)$/i.test(entry.name)) {
        const source = fs.readFileSync(fullPath, "utf8");
        if (/posLicenceSigning|signStandardLicencePayload|BEGIN PRIVATE KEY|PRIVATE KEY/.test(source)) {
          publicMatches.push(fullPath);
        }
      }
    }
  }
  scanPublic(path.join(rootDir, "public"));
  assert.deepEqual(publicMatches, []);
});
