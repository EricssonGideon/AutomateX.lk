const AuditLog = require("../models/AuditLog");
const PosActivationCode = require("../models/PosActivationCode");
const PosInstallation = require("../models/PosInstallation");
const PosLicence = require("../models/PosLicence");
const PosLicenceIssue = require("../models/PosLicenceIssue");
const PosLifecycleAuthorityEvent = require("../models/PosLifecycleAuthorityEvent");
const PosPackage = require("../models/PosPackage");

const POS_LICENSING_MODELS = Object.freeze([
  PosPackage,
  PosLicence,
  PosInstallation,
  PosActivationCode,
  PosLicenceIssue,
  PosLifecycleAuthorityEvent,
  AuditLog
]);

const REQUIRED_INDEXES = Object.freeze([
  ["PosPackage", { packageCode: 1 }, true],
  ["PosLicence", { clientId: 1, status: 1 }, false],
  ["PosInstallation", { licenceId: 1, deviceInstallationId: 1 }, true],
  ["PosInstallation", { renewalCredentialHash: 1 }, true],
  ["PosActivationCode", { codeHash: 1 }, true],
  ["PosLicenceIssue", { activationCodeId: 1, installationId: 1, issueReason: 1 }, true],
  ["PosLicenceIssue", { installationId: 1, issueReason: 1, predecessorSignatureHash: 1, renewalCredentialVersion: 1 }, true],
  ["PosLifecycleAuthorityEvent", { commandId: 1 }, true],
  ["PosLifecycleAuthorityEvent", { installationId: 1, sequence: 1 }, true],
  ["AuditLog", { module: 1, createdAt: -1 }, false]
]);

function normalizedKey(key) {
  return JSON.stringify(Object.entries(key || {}));
}

function defaultIndexName(key) {
  return Object.entries(key).map(([field, direction]) => `${field}_${direction}`).join("_");
}

function getPosLicensingProvisioningPlan() {
  return POS_LICENSING_MODELS.map((model) => ({
    model: model.modelName,
    collection: model.collection.name,
    indexes: model.schema.indexes().map(([key, options]) => ({
      key: { ...key },
      options: {
        ...options,
        name: options.name || defaultIndexName(key)
      }
    }))
  }));
}

function validatePosLicensingProvisioningPlan(plan = getPosLicensingProvisioningPlan()) {
  const errors = [];
  const byModel = new Map(plan.map((entry) => [entry.model, entry]));

  for (const entry of plan) {
    for (const index of entry.indexes) {
      if (Object.prototype.hasOwnProperty.call(index.options, "expireAfterSeconds")) {
        errors.push(`${entry.model}.${index.options.name}:ttl_forbidden`);
      }
    }
  }

  for (const [modelName, key, unique] of REQUIRED_INDEXES) {
    const entry = byModel.get(modelName);
    const found = entry && entry.indexes.find((index) => normalizedKey(index.key) === normalizedKey(key));
    if (!found) {
      errors.push(`${modelName}.${defaultIndexName(key)}:missing`);
    } else if (unique && found.options.unique !== true) {
      errors.push(`${modelName}.${found.options.name}:must_be_unique`);
    }
  }

  return { valid: errors.length === 0, errors };
}

async function provisionPosLicensingDatabase(connection, options = {}) {
  const plan = getPosLicensingProvisioningPlan();
  const validation = validatePosLicensingProvisioningPlan(plan);
  if (!validation.valid) {
    throw new Error("POS licensing provisioning definitions are incomplete.");
  }
  if (!options.apply) {
    return { applied: false, plan, validation };
  }
  if (!connection || !connection.db) {
    throw new Error("A connected MongoDB database is required for POS licensing provisioning.");
  }

  const results = [];
  for (const entry of plan) {
    try {
      await connection.db.createCollection(entry.collection);
    } catch (error) {
      if (!error || error.code !== 48) {
        throw error;
      }
    }
    const collection = connection.db.collection(entry.collection);
    for (const index of entry.indexes) {
      await collection.createIndex(index.key, index.options);
    }
    results.push({ collection: entry.collection, indexes: entry.indexes.length });
  }
  return { applied: true, results, validation };
}

module.exports = {
  POS_LICENSING_MODELS,
  REQUIRED_INDEXES,
  getPosLicensingProvisioningPlan,
  provisionPosLicensingDatabase,
  validatePosLicensingProvisioningPlan
};
