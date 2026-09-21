const crypto = require("node:crypto");

const bcrypt = require("bcryptjs");

const AuditLog = require("../models/AuditLog");
const User = require("../models/User");
const { REQUIRED_POS_TRANSACTION_OPTIONS } = require("../licensing/posLicensingTransactions");
const { hasPermission } = require("../middleware/auth");

const STAGING_ADMIN_EMAIL = "pos-licensing-staging-operator@staging.invalid";
const STAGING_ADMIN_NAME = "[STAGING TEST] POS Licensing Operator";
const STAGING_ADMIN_BUSINESS_NAME = "[STAGING ONLY] POS Licensing Test Operator";
const PASSWORD_BYTES = 48;
const BCRYPT_ROUNDS = 12;

class StagingPosAdminBootstrapError extends Error {
  constructor(code) {
    super(code);
    this.name = "StagingPosAdminBootstrapError";
    this.code = code;
  }
}

function fail(code) {
  throw new StagingPosAdminBootstrapError(code);
}

function defaultRepositories() {
  return {
    auditLogs: AuditLog,
    users: User
  };
}

function idText(value) {
  return value ? String(value._id || value.id || value) : "";
}

function exactIdentityMatches(user) {
  return Boolean(
    user &&
    user.email === STAGING_ADMIN_EMAIL &&
    user.name === STAGING_ADMIN_NAME &&
    user.businessName === STAGING_ADMIN_BUSINESS_NAME &&
    user.role === "admin" &&
    user.status === "active" &&
    user.isActive === true &&
    typeof user.passwordHash === "string" &&
    user.passwordHash.length > 0 &&
    hasPermission(user, "licences:manage")
  );
}

async function findIdentityMatches(repository, session) {
  let query = repository.find({
    $or: [
      { email: STAGING_ADMIN_EMAIL },
      { businessName: STAGING_ADMIN_BUSINESS_NAME }
    ]
  });
  if (query && typeof query.limit === "function") {
    query = query.limit(2);
  }
  if (query && typeof query.session === "function") {
    query = query.session(session);
  }
  return await query || [];
}

function projectResult(user, created) {
  if (!exactIdentityMatches(user)) {
    fail("staging_admin_identity_invalid");
  }
  return Object.freeze({
    created,
    adminId: idText(user),
    role: "admin",
    status: "active",
    licencesManage: true
  });
}

function createTransactionRunner(connection) {
  return async function runInTransaction(callback) {
    if (!connection || typeof connection.startSession !== "function") {
      fail("staging_admin_transaction_unavailable");
    }
    const session = await connection.startSession();
    try {
      let result;
      await session.withTransaction(async () => {
        result = await callback(session);
      }, REQUIRED_POS_TRANSACTION_OPTIONS);
      return result;
    } finally {
      await session.endSession();
    }
  };
}

function createStagingPosAdminBootstrapService(options = {}) {
  const repositories = options.repositories || defaultRepositories();
  const runInTransaction = options.runInTransaction || createTransactionRunner(options.connection);
  const generatePassword = options.generatePassword || (() => crypto.randomBytes(PASSWORD_BYTES).toString("base64url"));
  const hashPassword = options.hashPassword || ((password) => bcrypt.hash(password, BCRYPT_ROUNDS));

  return Object.freeze({
    async bootstrap() {
      return runInTransaction(async (session) => {
        const matches = await findIdentityMatches(repositories.users, session);
        if (matches.length > 1) {
          fail("staging_admin_identity_conflict");
        }
        if (matches.length === 1) {
          if (!exactIdentityMatches(matches[0])) {
            fail("staging_admin_identity_conflict");
          }
          return projectResult(matches[0], false);
        }

        let plaintextPassword = generatePassword();
        let passwordHash;
        try {
          if (typeof plaintextPassword !== "string" || plaintextPassword.length < 43) {
            fail("staging_admin_password_generation_failed");
          }
          passwordHash = await hashPassword(plaintextPassword);
        } finally {
          plaintextPassword = "";
        }
        if (typeof passwordHash !== "string" || !passwordHash) {
          fail("staging_admin_password_hash_failed");
        }

        const candidate = {
          name: STAGING_ADMIN_NAME,
          email: STAGING_ADMIN_EMAIL,
          passwordHash,
          role: "admin",
          status: "active",
          isActive: true,
          businessName: STAGING_ADMIN_BUSINESS_NAME
        };
        if (!hasPermission(candidate, "licences:manage")) {
          fail("staging_admin_permission_invalid");
        }

        const createdUsers = await repositories.users.create([candidate], { session });
        const user = createdUsers && createdUsers[0];
        if (!user || !exactIdentityMatches(user)) {
          fail("staging_admin_creation_failed");
        }

        await repositories.auditLogs.create([{
          actorId: null,
          actorName: "",
          actorEmail: "",
          actorRole: "",
          action: "users.staging-pos-licensing-admin.bootstrap",
          module: "Users",
          targetType: "User",
          targetId: idText(user),
          targetLabel: STAGING_ADMIN_EMAIL,
          oldValue: null,
          newValue: {
            environment: "staging",
            identity: "pos-licensing-test-operator",
            role: "admin",
            status: "active",
            licencesManage: true
          },
          severity: "High"
        }], { session });

        passwordHash = "";
        return projectResult(user, true);
      });
    }
  });
}

module.exports = {
  BCRYPT_ROUNDS,
  PASSWORD_BYTES,
  STAGING_ADMIN_BUSINESS_NAME,
  STAGING_ADMIN_EMAIL,
  STAGING_ADMIN_NAME,
  StagingPosAdminBootstrapError,
  createStagingPosAdminBootstrapService,
  exactIdentityMatches
};
