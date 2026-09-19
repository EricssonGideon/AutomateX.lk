const crypto = require("node:crypto");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");

const User = require("../models/User");
const Project = require("../models/Project");
const AuditLog = require("../models/AuditLog");
const PosPackage = require("../models/PosPackage");
const PosLicence = require("../models/PosLicence");
const PosActivationCode = require("../models/PosActivationCode");
const {
  POS_EDITION_STANDARD,
  POS_STANDARD_MODULE_IDS
} = require("../utils/posLicenceContract");
const {
  createPosLicenceAdminService
} = require("./posLicenceAdminService");
const {
  createPosLicenceLifecycleService
} = require("./posLicenceLifecycleService");
const {
  createPosActivationCodeAdminService
} = require("./posActivationCodeAdminService");
const {
  REQUIRED_POS_TRANSACTION_OPTIONS
} = require("../licensing/posLicensingTransactions");

const STAGING_FIXTURE_MARKER = "automatex-pos-licensing-staging-test-fixture-v1";
const STAGING_FIXTURE_CLIENT_EMAIL = "pos-licensing-staging-fixture@staging.invalid";
const STAGING_FIXTURE_CLIENT_NAME = "POS Licensing Staging Test Client";
const STAGING_FIXTURE_PROJECT_TITLE = "[STAGING TEST] POS Standard Activation";
const STAGING_FIXTURE_PACKAGE_CODE = "pos-standard-staging-test-v1";
const STAGING_FIXTURE_PACKAGE_NAME = "[STAGING TEST] POS Standard";
const LICENCE_LIFETIME_MS = 24 * 60 * 60 * 1000;
const OFFLINE_LIFETIME_MS = 6 * 60 * 60 * 1000;
const ACTIVATION_CODE_LIFETIME_MS = 30 * 60 * 1000;

class StagingPosActivationFixtureError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "StagingPosActivationFixtureError";
    this.code = code;
  }
}

function idText(value) {
  if (!value) {
    return "";
  }
  return String(value._id || value.id || value);
}

function sameId(left, right) {
  return idText(left) === idText(right);
}

function fixtureError(code, message) {
  throw new StagingPosActivationFixtureError(code, message);
}

function defaultRepositories() {
  return {
    users: User,
    projects: Project,
    auditLogs: AuditLog,
    posPackages: PosPackage,
    posLicences: PosLicence,
    posActivationCodes: PosActivationCode
  };
}

async function findOne(repository, query, session) {
  let result = repository.findOne(query);
  if (result && typeof result.session === "function") {
    result = result.session(session);
  }
  return result;
}

async function findMany(repository, query, session) {
  let result = repository.find(query);
  if (result && typeof result.session === "function") {
    result = result.session(session);
  }
  if (result && typeof result.lean === "function") {
    result = result.lean();
  }
  return await result || [];
}

async function createOne(repository, record, session) {
  const records = await repository.create([record], { session });
  return records[0];
}

function defaultAuditLogger(repositories) {
  return {
    async create(entry, options = {}) {
      const records = await repositories.auditLogs.create([entry], options);
      return records[0];
    }
  };
}

function createDefaultTransactionRunner(connection) {
  return async function runInTransaction(callback) {
    if (!connection || typeof connection.startSession !== "function") {
      fixtureError("transaction_unavailable", "MongoDB transactions are required for the staging activation fixture.");
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const session = await connection.startSession();
      try {
        let result;
        await session.withTransaction(async () => {
          result = await callback(session);
        }, REQUIRED_POS_TRANSACTION_OPTIONS);
        return result;
      } catch (error) {
        if (error instanceof StagingPosActivationFixtureError) {
          throw error;
        }
        if (!error || typeof error.hasErrorLabel !== "function" || !error.hasErrorLabel("TransientTransactionError")) {
          throw error;
        }
      } finally {
        await session.endSession();
      }
    }

    fixtureError("transaction_failed", "The staging activation fixture transaction could not be completed.");
  };
}

function assertControlledClient(client) {
  if (
    client.role !== "client" ||
    client.name !== STAGING_FIXTURE_CLIENT_NAME ||
    client.businessName !== STAGING_FIXTURE_MARKER
  ) {
    fixtureError("fixture_identity_conflict", "The staging fixture client identity conflicts with an existing record.");
  }
}

function assertControlledProject(project, client) {
  if (
    project.projectTitle !== STAGING_FIXTURE_PROJECT_TITLE ||
    project.projectType !== "POS System" ||
    project.adminNotes !== STAGING_FIXTURE_MARKER ||
    !sameId(project.clientId, client)
  ) {
    fixtureError("fixture_identity_conflict", "The staging fixture project identity conflicts with an existing record.");
  }
}

function assertControlledPackage(posPackage) {
  if (
    posPackage.packageCode !== STAGING_FIXTURE_PACKAGE_CODE ||
    posPackage.name !== STAGING_FIXTURE_PACKAGE_NAME ||
    posPackage.edition !== POS_EDITION_STANDARD ||
    posPackage.notes !== STAGING_FIXTURE_MARKER ||
    !["draft", "active"].includes(posPackage.status)
  ) {
    fixtureError("fixture_identity_conflict", "The staging fixture package identity conflicts with an existing record.");
  }
}

function assertControlledLicence(licence, client, project, posPackage) {
  if (
    licence.notes !== STAGING_FIXTURE_MARKER ||
    licence.edition !== POS_EDITION_STANDARD ||
    !["draft", "active"].includes(licence.status) ||
    !sameId(licence.clientId, client) ||
    !sameId(licence.projectId, project) ||
    !sameId(licence.packageId, posPackage) ||
    Number(licence.maxInstallations) !== 1
  ) {
    fixtureError("fixture_identity_conflict", "The staging fixture licence identity conflicts with an existing record.");
  }
}

function createServicesForSession(repositories, auditLogger, session, clock, generateCode) {
  const serviceRepositories = {
    users: repositories.users,
    projects: repositories.projects,
    posPackages: repositories.posPackages,
    posLicences: repositories.posLicences,
    posActivationCodes: repositories.posActivationCodes
  };
  const reuseOuterTransaction = async (callback) => callback(session);

  return {
    admin: createPosLicenceAdminService({ repositories: serviceRepositories, auditLogger }),
    lifecycle: createPosLicenceLifecycleService({
      repositories: serviceRepositories,
      auditLogger,
      runInTransaction: reuseOuterTransaction,
      clock
    }),
    activationCode: createPosActivationCodeAdminService({
      repositories: serviceRepositories,
      auditLogger,
      runInTransaction: reuseOuterTransaction,
      clock,
      ...(generateCode ? { generateCode } : {})
    })
  };
}

function createStagingPosActivationFixtureService(options = {}) {
  const repositories = options.repositories || defaultRepositories();
  const connection = options.connection || mongoose.connection;
  const auditLogger = options.auditLogger || defaultAuditLogger(repositories);
  const clock = options.clock || (() => new Date());
  const hashPassword = options.hashPassword || ((password) => bcrypt.hash(password, 12));
  const runInTransaction = options.runInTransaction || createDefaultTransactionRunner(connection);

  return {
    async createFixture(actor) {
      return runInTransaction(async (session) => {
        const now = clock();
        const services = createServicesForSession(
          repositories,
          auditLogger,
          session,
          clock,
          options.generateCode
        );

        let client = await findOne(repositories.users, { email: STAGING_FIXTURE_CLIENT_EMAIL }, session);
        if (client) {
          assertControlledClient(client);
        } else {
          const passwordHash = await hashPassword(crypto.randomBytes(32).toString("hex"));
          client = await createOne(repositories.users, {
            name: STAGING_FIXTURE_CLIENT_NAME,
            email: STAGING_FIXTURE_CLIENT_EMAIL,
            passwordHash,
            role: "client",
            status: "active",
            accountStatus: "active",
            isActive: true,
            businessName: STAGING_FIXTURE_MARKER
          }, session);
        }

        let project = await findOne(repositories.projects, {
          projectTitle: STAGING_FIXTURE_PROJECT_TITLE,
          adminNotes: STAGING_FIXTURE_MARKER
        }, session);
        if (project) {
          assertControlledProject(project, client);
        } else {
          project = await createOne(repositories.projects, {
            clientId: client._id,
            projectTitle: STAGING_FIXTURE_PROJECT_TITLE,
            projectType: "POS System",
            packageName: STAGING_FIXTURE_PACKAGE_NAME,
            status: "Testing",
            priority: "Low",
            description: STAGING_FIXTURE_MARKER,
            adminNotes: STAGING_FIXTURE_MARKER,
            createdBy: actor.id,
            updatedBy: actor.id
          }, session);
        }

        let posPackage = await findOne(repositories.posPackages, {
          packageCode: STAGING_FIXTURE_PACKAGE_CODE
        }, session);
        if (posPackage) {
          assertControlledPackage(posPackage);
        } else {
          const draftPackage = await services.admin.createDraftPackage(actor, {
            packageCode: STAGING_FIXTURE_PACKAGE_CODE,
            name: STAGING_FIXTURE_PACKAGE_NAME,
            edition: POS_EDITION_STANDARD,
            moduleIds: [...POS_STANDARD_MODULE_IDS],
            updateChannels: ["stable"],
            notes: STAGING_FIXTURE_MARKER
          }, { session });
          if (!draftPackage.audit || draftPackage.audit.ok !== true) {
            fixtureError("fixture_audit_failed", "The staging fixture package audit could not be confirmed.");
          }
          const published = await services.lifecycle.publishDraftPackage(actor, draftPackage.package.id, {
            expectedVersion: draftPackage.package.version,
            reason: "Publish controlled staging activation fixture"
          });
          posPackage = await findOne(repositories.posPackages, { _id: published.package.id }, session);
        }
        if (posPackage.status === "draft") {
          const published = await services.lifecycle.publishDraftPackage(actor, idText(posPackage), {
            expectedVersion: Number.isInteger(posPackage.__v) ? posPackage.__v : 0,
            reason: "Publish controlled staging activation fixture"
          });
          posPackage = await findOne(repositories.posPackages, { _id: published.package.id }, session);
        }

        let licence = await findOne(repositories.posLicences, { notes: STAGING_FIXTURE_MARKER }, session);
        if (licence) {
          assertControlledLicence(licence, client, project, posPackage);
        } else {
          const licenceExpiry = new Date(now.getTime() + LICENCE_LIFETIME_MS);
          const draftLicence = await services.admin.createDraftLicence(actor, {
            clientId: idText(client),
            projectId: idText(project),
            packageId: idText(posPackage),
            edition: POS_EDITION_STANDARD,
            entitledModules: [...POS_STANDARD_MODULE_IDS],
            updateChannel: "stable",
            licenceExpiry,
            supportExpiry: licenceExpiry,
            offlineValidUntil: new Date(now.getTime() + OFFLINE_LIFETIME_MS),
            maxInstallations: 1,
            notes: STAGING_FIXTURE_MARKER
          }, { session });
          if (!draftLicence.audit || draftLicence.audit.ok !== true) {
            fixtureError("fixture_audit_failed", "The staging fixture licence audit could not be confirmed.");
          }
          const approved = await services.lifecycle.approveDraftLicence(actor, draftLicence.licence.id, {
            expectedVersion: draftLicence.licence.version,
            reason: "Approve controlled staging activation fixture"
          });
          licence = await findOne(repositories.posLicences, { _id: approved.licence.id }, session);
        }
        if (licence.status === "draft") {
          const approved = await services.lifecycle.approveDraftLicence(actor, idText(licence), {
            expectedVersion: Number.isInteger(licence.__v) ? licence.__v : 0,
            reason: "Approve controlled staging activation fixture"
          });
          licence = await findOne(repositories.posLicences, { _id: approved.licence.id }, session);
        }

        const activationCodes = await findMany(repositories.posActivationCodes, {
          licenceId: licence._id
        }, session);
        if (activationCodes.length > 1) {
          fixtureError("fixture_identity_conflict", "The staging fixture already has multiple activation codes.");
        }
        if (activationCodes.length === 1) {
          if (Number(activationCodes[0].maxRedemptions) !== 1) {
            fixtureError("fixture_identity_conflict", "The staging fixture activation-code policy conflicts with the controlled fixture.");
          }
          return Object.freeze({
            created: false,
            alreadyExists: true,
            maxInstallations: 1,
            maxRedemptions: 1
          });
        }

        const codeExpiry = new Date(Math.min(
          now.getTime() + ACTIVATION_CODE_LIFETIME_MS,
          new Date(licence.licenceExpiry).getTime()
        ));
        const issued = await services.activationCode.issueActivationCode(actor, idText(licence), {
          expiresAt: codeExpiry,
          maxRedemptions: 1
        });

        await auditLogger.create({
          actorId: actor.id,
          actorName: actor.name || "",
          actorEmail: actor.email || "",
          actorRole: actor.role,
          action: "licences.staging-test-fixture.create",
          module: "Licences",
          targetType: "PosLicence",
          targetId: idText(licence),
          targetLabel: STAGING_FIXTURE_MARKER,
          oldValue: null,
          newValue: {
            clientId: idText(client),
            projectId: idText(project),
            packageId: idText(posPackage),
            licenceId: idText(licence),
            activationCodeId: issued.activationCodeMetadata.id,
            maxInstallations: 1,
            maxRedemptions: 1
          },
          severity: "Medium"
        }, { session });

        return Object.freeze({
          created: true,
          alreadyExists: false,
          activationCode: issued.activationCode,
          maxInstallations: 1,
          maxRedemptions: 1
        });
      });
    }
  };
}

module.exports = {
  ACTIVATION_CODE_LIFETIME_MS,
  LICENCE_LIFETIME_MS,
  OFFLINE_LIFETIME_MS,
  STAGING_FIXTURE_CLIENT_EMAIL,
  STAGING_FIXTURE_MARKER,
  STAGING_FIXTURE_PACKAGE_CODE,
  STAGING_FIXTURE_PROJECT_TITLE,
  StagingPosActivationFixtureError,
  createStagingPosActivationFixtureService
};
