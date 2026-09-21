const mongoose = require("mongoose");

const AuditLog = require("../server/models/AuditLog");
const PosActivationCode = require("../server/models/PosActivationCode");
const PosLicence = require("../server/models/PosLicence");
const PosPackage = require("../server/models/PosPackage");
const Project = require("../server/models/Project");
const User = require("../server/models/User");
const { loadRuntimeEnvironment } = require("../server/config/loadRuntimeEnvironment");
const { validateStagingLicensingConfig } = require("../server/config/posLicensingProduction");
const { getPosLicensingMongoConnectionOptions } = require("../server/config/posLicensingMongo");
const {
  REQUIRED_POS_TRANSACTION_OPTIONS,
  inspectMongoTransactionCapability
} = require("../server/licensing/posLicensingTransactions");
const { hasPermission } = require("../server/middleware/auth");
const {
  createPosActivationCodeAdminService
} = require("../server/services/posActivationCodeAdminService");
const {
  createPosLicenceAdminService
} = require("../server/services/posLicenceAdminService");
const {
  createPosLicenceLifecycleService
} = require("../server/services/posLicenceLifecycleService");
const {
  FIXTURE_CLIENT_EMAIL,
  FIXTURE_CLIENT_NAME,
  FIXTURE_MARKER,
  FIXTURE_PACKAGE_CODE,
  FIXTURE_PACKAGE_NAME,
  FIXTURE_PROJECT_TITLE
} = require("../server/services/stagingPosActivationEligibilityService");
const {
  POS_EDITION_STANDARD,
  POS_STANDARD_MODULE_IDS
} = require("../server/utils/posLicenceContract");
const {
  sanitizeLicenceAuditMetadata,
  validatePosPackagePolicy
} = require("../server/utils/posLicencePolicy");

const EXPECTED_BRANCH = "pos-licensing-staging";
const LICENCE_DURATION_MS = 24 * 60 * 60 * 1000;
const OFFLINE_DURATION_MS = 6 * 60 * 60 * 1000;
const ACTIVATION_CODE_DURATION_MS = 60 * 60 * 1000;
const RENEWAL_WINDOW_DURATION_MINUTES = 60;
const TEST_MARKER_PATTERN = /^automatex-pos-staging-test-[a-z0-9][a-z0-9._-]{2,79}$/;
const CONFIG_ENV_NAMES = Object.freeze([
  "ALLOWED_ORIGINS",
  "AUTOMATEX_ENV",
  "MONGO_URI",
  "NODE_ENV",
  "POS_LICENSING_CLIENT_SCOPE",
  "POS_LICENSING_DATABASE_NAME",
  "POS_LICENSING_ENVIRONMENT",
  "POS_LICENSING_MACHINE_ALLOWED_ORIGINS",
  "POS_LICENSING_MACHINE_API_ORIGIN",
  "POS_LICENSING_MODE",
  "POS_LICENSING_PRODUCTION_ADMIN_ORIGINS",
  "POS_LICENSING_PRODUCTION_HOSTNAME",
  "POS_LICENSING_PROXY_TRUST_MODE",
  "POS_LICENSING_SECRET_ENVIRONMENT",
  "POS_LICENSING_SECRET_SOURCE",
  "POS_LICENSING_STAGING_ADMIN_ORIGINS",
  "POS_LICENSING_STAGING_HOSTNAME",
  "POS_LICENSING_TRUSTED_PROXY_CIDRS",
  "VERCEL_ENV",
  "VERCEL_GIT_COMMIT_REF"
]);

class StagingTestLicenceOperatorError extends Error {
  constructor(code) {
    super(code);
    this.name = "StagingTestLicenceOperatorError";
    this.code = code;
  }
}

function fail(code) {
  throw new StagingTestLicenceOperatorError(code);
}

function clean(value) {
  return String(value || "").trim();
}

function idText(value) {
  return value ? String(value._id || value.id || value) : "";
}

function parseCliArguments(argv = []) {
  const parsed = { apply: false, adminId: "", testMarker: "" };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--apply") {
      parsed.apply = true;
      continue;
    }

    const [name, inlineValue] = argument.split("=", 2);
    if (!["--admin-id", "--test-marker"].includes(name)) {
      fail("invalid_argument");
    }
    const value = typeof inlineValue === "string" ? inlineValue : argv[index += 1];
    if (!value || value.startsWith("--")) {
      fail("missing_argument_value");
    }
    const field = name === "--admin-id" ? "adminId" : "testMarker";
    if (parsed[field]) {
      fail("duplicate_argument");
    }
    parsed[field] = clean(value);
  }

  if (!mongoose.Types.ObjectId.isValid(parsed.adminId) || clean(new mongoose.Types.ObjectId(parsed.adminId)) !== parsed.adminId.toLowerCase()) {
    fail("invalid_admin_id");
  }
  if (!TEST_MARKER_PATTERN.test(parsed.testMarker) || parsed.testMarker === FIXTURE_MARKER) {
    fail("invalid_test_marker");
  }

  return Object.freeze(parsed);
}

function validateExecutionContext(env = process.env) {
  if (
    clean(env.VERCEL_ENV).toLowerCase() !== "preview" ||
    clean(env.VERCEL_GIT_COMMIT_REF) !== EXPECTED_BRANCH ||
    clean(env.AUTOMATEX_ENV).toLowerCase() !== "staging" ||
    clean(env.POS_LICENSING_MODE).toLowerCase() !== "staging"
  ) {
    fail("staging_execution_context_rejected");
  }
}

function stagingValidationEnvironment(env = process.env) {
  return CONFIG_ENV_NAMES.reduce((selected, name) => {
    if (typeof env[name] !== "undefined") {
      selected[name] = env[name];
    }
    return selected;
  }, {});
}

function validateConnectedDatabase(connection, expectedDatabaseName) {
  const actualDatabaseName = clean(connection && (
    connection.name || connection.db && connection.db.databaseName
  ));
  if (!actualDatabaseName || actualDatabaseName !== expectedDatabaseName) {
    fail("staging_database_identity_mismatch");
  }
}

function defaultRepositories() {
  return {
    auditLogs: AuditLog,
    posActivationCodes: PosActivationCode,
    posLicences: PosLicence,
    posPackages: PosPackage,
    projects: Project,
    users: User
  };
}

async function leanMany(query, projection, session) {
  let result = query;
  if (projection && result && typeof result.select === "function") {
    result = result.select(projection);
  }
  if (session && result && typeof result.session === "function") {
    result = result.session(session);
  }
  if (result && typeof result.lean === "function") {
    result = result.lean();
  }
  return await result || [];
}

async function readOperatorPrerequisites(repositories, input, options = {}) {
  const session = options.session;
  const [admins, clients, projects, packages, markerMatches] = await Promise.all([
    leanMany(repositories.users.find({ _id: input.adminId }),
      "_id name email role status isActive", session),
    leanMany(repositories.users.find({ email: FIXTURE_CLIENT_EMAIL }),
      "_id name email role status isActive businessName", session),
    leanMany(repositories.projects.find({
      projectTitle: FIXTURE_PROJECT_TITLE,
      adminNotes: FIXTURE_MARKER
    }), "_id clientId projectTitle projectType status isArchived adminNotes", session),
    leanMany(repositories.posPackages.find({ packageCode: FIXTURE_PACKAGE_CODE }),
      "_id packageCode name edition status moduleIds updateChannels notes", session),
    leanMany(repositories.posLicences.find({ notes: input.testMarker }), "_id notes", session)
  ]);

  return { admins, clients, projects, packages, markerMatches };
}

function exactlyOne(records, code) {
  if (!Array.isArray(records) || records.length !== 1) {
    fail(code);
  }
  return records[0];
}

function validatePrerequisites(records, transactionCapability) {
  const admin = exactlyOne(records.admins, "staging_admin_missing_or_ambiguous");
  const client = exactlyOne(records.clients, "fixture_client_missing_or_ambiguous");
  const project = exactlyOne(records.projects, "fixture_project_missing_or_ambiguous");
  const posPackage = exactlyOne(records.packages, "fixture_package_missing_or_ambiguous");

  if (admin.status !== "active" || admin.isActive === false) {
    fail("staging_admin_inactive");
  }
  if (admin.role !== "admin" || !hasPermission(admin, "licences:manage")) {
    fail("staging_admin_unauthorized");
  }
  if (
    client.name !== FIXTURE_CLIENT_NAME ||
    client.email !== FIXTURE_CLIENT_EMAIL ||
    client.role !== "client" ||
    client.status !== "active" ||
    client.isActive === false ||
    client.businessName !== FIXTURE_MARKER
  ) {
    fail("fixture_client_identity_mismatch");
  }
  if (
    project.projectTitle !== FIXTURE_PROJECT_TITLE ||
    project.projectType !== "POS System" ||
    project.adminNotes !== FIXTURE_MARKER ||
    project.isArchived === true ||
    project.status === "Cancelled" ||
    idText(project.clientId) !== idText(client)
  ) {
    fail("fixture_project_identity_mismatch");
  }

  const packageModules = new Set(posPackage.moduleIds || []);
  const hasEveryStandardModule = POS_STANDARD_MODULE_IDS.every((moduleId) => packageModules.has(moduleId)) &&
    packageModules.size === POS_STANDARD_MODULE_IDS.length;
  if (
    posPackage.packageCode !== FIXTURE_PACKAGE_CODE ||
    posPackage.name !== FIXTURE_PACKAGE_NAME ||
    posPackage.notes !== FIXTURE_MARKER ||
    posPackage.edition !== POS_EDITION_STANDARD ||
    posPackage.status !== "active"
  ) {
    fail("fixture_package_identity_mismatch");
  }
  if (!hasEveryStandardModule || !(posPackage.updateChannels || []).includes("stable") ||
    validatePosPackagePolicy(posPackage, { requireIssuable: true }).length) {
    fail("fixture_package_standard_contract_invalid");
  }
  if (!Array.isArray(records.markerMatches) || records.markerMatches.length !== 0) {
    fail("test_marker_already_exists");
  }
  if (!transactionCapability || !transactionCapability.supported || !transactionCapability.verified || !transactionCapability.probePassed) {
    fail("mongodb_transaction_requirement_failed");
  }

  return Object.freeze({ admin, client, project, posPackage });
}

function createAuditLogger(repositories) {
  return {
    async create(entry, options = {}) {
      const records = await repositories.auditLogs.create([entry], options);
      return records[0];
    }
  };
}

function actorFrom(admin) {
  return Object.freeze({
    id: idText(admin),
    name: clean(admin.name),
    email: clean(admin.email),
    role: admin.role
  });
}

function assertAuditSucceeded(result) {
  if (!result || !result.audit || result.audit.ok !== true) {
    fail("licence_audit_failed");
  }
}

async function applyStagingLicencePlan(options) {
  const {
    connection,
    input,
    repositories,
    initialPrerequisites
  } = options;
  if (!input.apply) {
    fail("apply_required_for_writes");
  }
  if (!connection || typeof connection.startSession !== "function") {
    fail("mongodb_transaction_requirement_failed");
  }

  const clock = options.clock || (() => new Date());
  const readPrerequisites = options.readPrerequisites || readOperatorPrerequisites;
  const createAdminService = options.createAdminService || createPosLicenceAdminService;
  const createLifecycleService = options.createLifecycleService || createPosLicenceLifecycleService;
  const createActivationService = options.createActivationService || createPosActivationCodeAdminService;
  const auditLogger = options.auditLogger || createAuditLogger(repositories);
  const session = await connection.startSession();
  let committedResult = null;

  try {
    await session.withTransaction(async () => {
      const currentRecords = await readPrerequisites(repositories, input, { session });
      const current = validatePrerequisites(currentRecords, {
        supported: true,
        verified: true,
        probePassed: true
      });
      if (
        idText(current.admin) !== idText(initialPrerequisites.admin) ||
        idText(current.client) !== idText(initialPrerequisites.client) ||
        idText(current.project) !== idText(initialPrerequisites.project) ||
        idText(current.posPackage) !== idText(initialPrerequisites.posPackage)
      ) {
        fail("staging_prerequisites_changed");
      }

      const actor = actorFrom(current.admin);
      const now = clock();
      const licenceExpiry = new Date(now.getTime() + LICENCE_DURATION_MS);
      const supportExpiry = new Date(now.getTime() + LICENCE_DURATION_MS);
      const offlineValidUntil = new Date(now.getTime() + OFFLINE_DURATION_MS);
      const activationCodeExpiry = new Date(now.getTime() + ACTIVATION_CODE_DURATION_MS);
      const reuseOuterTransaction = async (callback) => callback(session);
      const serviceOptions = { repositories, auditLogger };
      const adminService = createAdminService(serviceOptions);
      const lifecycleService = createLifecycleService({
        ...serviceOptions,
        clock: () => now,
        runInTransaction: reuseOuterTransaction
      });
      const activationService = createActivationService({
        ...serviceOptions,
        clock: () => now,
        runInTransaction: reuseOuterTransaction
      });

      const draftResult = await adminService.createDraftLicence(actor, {
        clientId: idText(current.client),
        projectId: idText(current.project),
        packageId: idText(current.posPackage),
        edition: POS_EDITION_STANDARD,
        entitledModules: [...POS_STANDARD_MODULE_IDS],
        updateChannel: "stable",
        licenceExpiry,
        supportExpiry,
        offlineValidUntil,
        maxInstallations: 1,
        notes: input.testMarker
      }, { session });
      assertAuditSucceeded(draftResult);

      const licenceId = draftResult.licence.id;
      const renewalConfigured = await repositories.posLicences.findOneAndUpdate(
        { _id: licenceId, status: "draft", __v: draftResult.licence.version },
        {
          $set: {
            renewalWindowDurationMinutes: RENEWAL_WINDOW_DURATION_MINUTES,
            updatedBy: actor.id
          },
          $inc: { __v: 1 }
        },
        { new: true, runValidators: true, session }
      );
      if (!renewalConfigured) {
        fail("renewal_policy_assignment_failed");
      }

      await auditLogger.create({
        actorId: actor.id,
        actorName: actor.name,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: "licences.licence.configure-staging-renewal-policy",
        module: "Licences",
        targetType: "PosLicence",
        targetId: licenceId,
        targetLabel: "",
        oldValue: null,
        newValue: sanitizeLicenceAuditMetadata({
          action: "licences.licence.configure-staging-renewal-policy",
          actorId: actor.id,
          actorEmail: actor.email,
          actorRole: actor.role,
          targetType: "PosLicence",
          targetId: licenceId,
          licenceId,
          packageId: idText(current.posPackage),
          outcome: "success",
          changeSummary: "renewalWindowDurationMinutes",
          createdAt: now.toISOString()
        }),
        severity: "Medium"
      }, { session });

      const renewalVersion = Number.isInteger(renewalConfigured.__v)
        ? renewalConfigured.__v
        : draftResult.licence.version + 1;
      const approvedResult = await lifecycleService.approveDraftLicence(actor, licenceId, {
        expectedVersion: renewalVersion,
        reason: "Controlled Tauri staging end-to-end test"
      });
      const issuedResult = await activationService.issueActivationCode(actor, licenceId, {
        expiresAt: activationCodeExpiry,
        maxRedemptions: 1
      });

      committedResult = Object.freeze({
        activationCode: issuedResult.activationCode,
        activationCodeExpiresAt: activationCodeExpiry.toISOString(),
        activationCodeId: issuedResult.activationCodeMetadata.id,
        licenceExpiry: licenceExpiry.toISOString(),
        licenceId: approvedResult.licence.id,
        marker: input.testMarker
      });
    }, REQUIRED_POS_TRANSACTION_OPTIONS);
  } finally {
    await session.endSession();
  }

  if (!committedResult || !committedResult.activationCode) {
    fail("staging_licence_transaction_not_committed");
  }
  return committedResult;
}

function dryRunOutput(input) {
  return Object.freeze({
    ok: true,
    mode: "dry-run",
    writesPerformed: false,
    marker: input.testMarker,
    checks: Object.freeze({
      exactStagingEnvironment: true,
      stagingDatabaseIdentity: true,
      persistedAdminAuthorized: true,
      controlledClientPresent: true,
      controlledProjectPresent: true,
      reusableStandardPackagePresent: true,
      allStandardModulesPresent: true,
      transactionCapability: true,
      uniqueMarkerAvailable: true
    }),
    plan: Object.freeze({
      edition: POS_EDITION_STANDARD,
      maxInstallations: 1,
      licenceDurationHours: 24,
      supportDurationHours: 24,
      initialOfflineDurationHours: 6,
      renewalWindowDurationMinutes: RENEWAL_WINDOW_DURATION_MINUTES,
      activationCodeDurationMinutes: 60,
      maxRedemptions: 1
    })
  });
}

function applyOutput(result) {
  return Object.freeze({
    ok: true,
    mode: "apply",
    writesPerformed: true,
    marker: result.marker,
    licenceId: result.licenceId,
    licenceExpiry: result.licenceExpiry,
    activationCodeId: result.activationCodeId,
    activationCodeExpiresAt: result.activationCodeExpiresAt,
    activationCode: result.activationCode
  });
}

async function runStagingTestLicenceOperator(options = {}) {
  const env = options.env || process.env;
  const input = options.input || parseCliArguments(options.argv || process.argv.slice(2));
  const mongo = options.mongo || mongoose;
  const repositories = options.repositories || defaultRepositories();
  const readPrerequisites = options.readPrerequisites || readOperatorPrerequisites;
  const inspectTransactions = options.inspectTransactions || inspectMongoTransactionCapability;
  const suppliedConnection = options.connection || null;
  let connectionAttempted = false;

  try {
    (options.loadEnvironment || loadRuntimeEnvironment)({ env });
    validateExecutionContext(env);
    const config = (options.validateConfig || validateStagingLicensingConfig)(
      stagingValidationEnvironment(env)
    );
    if (config.environment !== "staging" || config.mode !== "staging" || config.clientScope !== "staging-only") {
      fail("staging_configuration_rejected");
    }

    let connection = suppliedConnection;
    if (!connection) {
      connectionAttempted = true;
      await mongo.connect(
        config.secrets.getMongoUri(),
        getPosLicensingMongoConnectionOptions(config.databaseName)
      );
      connection = mongo.connection;
    }
    validateConnectedDatabase(connection, config.databaseName);

    const records = await readPrerequisites(repositories, input);
    const capability = await inspectTransactions(connection);
    const prerequisites = validatePrerequisites(records, capability);
    if (!input.apply) {
      return dryRunOutput(input);
    }

    const result = await (options.applyPlan || applyStagingLicencePlan)({
      ...options.applyOptions,
      connection,
      initialPrerequisites: prerequisites,
      input,
      readPrerequisites,
      repositories
    });
    return applyOutput(result);
  } finally {
    if (connectionAttempted && typeof mongo.disconnect === "function") {
      await mongo.disconnect().catch(() => null);
    }
  }
}

async function executeStagingTestLicenceOperatorCommand(options = {}) {
  const argv = options.argv || process.argv.slice(2);
  try {
    const output = await runStagingTestLicenceOperator({ ...options, argv });
    (options.stdout || process.stdout).write(`${JSON.stringify(output, null, 2)}\n`);
    return Object.freeze({ output, exitCode: 0 });
  } catch (error) {
    const code = error instanceof StagingTestLicenceOperatorError
      ? error.code
      : "staging_test_licence_operator_failed_closed";
    const output = Object.freeze({ ok: false, code });
    (options.stderr || process.stderr).write(`${JSON.stringify(output)}\n`);
    return Object.freeze({ output, exitCode: 1 });
  }
}

if (require.main === module) {
  executeStagingTestLicenceOperatorCommand()
    .then(({ exitCode }) => {
      process.exitCode = exitCode;
    })
    .catch(() => {
      process.stderr.write('{"ok":false,"code":"staging_test_licence_operator_failed_closed"}\n');
      process.exitCode = 1;
    });
}

module.exports = {
  ACTIVATION_CODE_DURATION_MS,
  EXPECTED_BRANCH,
  LICENCE_DURATION_MS,
  OFFLINE_DURATION_MS,
  RENEWAL_WINDOW_DURATION_MINUTES,
  StagingTestLicenceOperatorError,
  applyStagingLicencePlan,
  executeStagingTestLicenceOperatorCommand,
  parseCliArguments,
  readOperatorPrerequisites,
  runStagingTestLicenceOperator,
  stagingValidationEnvironment,
  validateConnectedDatabase,
  validateExecutionContext,
  validatePrerequisites
};
