const REQUIRED_POS_TRANSACTION_OPTIONS = Object.freeze({
  readConcern: Object.freeze({ level: "snapshot" }),
  writeConcern: Object.freeze({ w: "majority" }),
  readPreference: "primary"
});

function capability(overrides = {}) {
  return Object.freeze({
    supported: false,
    verified: false,
    logicalSessions: false,
    transactionalTopology: false,
    probePassed: false,
    reason: "transaction_capability_not_verified",
    ...overrides
  });
}

async function inspectMongoTransactionCapability(connection, options = {}) {
  if (!connection || !connection.db || typeof connection.db.admin !== "function") {
    return capability({ reason: "database_not_connected" });
  }

  let hello;
  try {
    hello = await connection.db.admin().command({ hello: 1 });
  } catch {
    return capability({ reason: "topology_check_failed" });
  }

  const hasSessions = typeof hello.logicalSessionTimeoutMinutes === "number" && hello.logicalSessionTimeoutMinutes > 0;
  const transactionalTopology = Boolean(hello.setName) || hello.msg === "isdbgrid";
  if (!hasSessions) {
    return capability({ verified: true, transactionalTopology, reason: "logical_sessions_unsupported" });
  }
  if (!transactionalTopology) {
    return capability({ verified: true, logicalSessions: true, reason: "transaction_topology_unsupported" });
  }

  if (typeof connection.startSession !== "function") {
    return capability({ verified: true, logicalSessions: true, transactionalTopology: true, reason: "session_api_unavailable" });
  }

  let session;
  let transactionStarted = false;
  let transactionAborted = false;
  try {
    session = await connection.startSession();
    if (!session) {
      return capability({ verified: true, logicalSessions: true, transactionalTopology: true, reason: "transaction_api_unavailable" });
    }

    if (options.abortAfterProbe === true) {
      if (typeof session.startTransaction !== "function" || typeof session.abortTransaction !== "function") {
        return capability({ verified: true, logicalSessions: true, transactionalTopology: true, reason: "transaction_api_unavailable" });
      }
      session.startTransaction(REQUIRED_POS_TRANSACTION_OPTIONS);
      transactionStarted = true;
      await connection.db.collection("pospackages").findOne({}, { session, projection: { _id: 1 } });
      await session.abortTransaction();
      transactionAborted = true;
    } else {
      if (typeof session.withTransaction !== "function") {
        return capability({ verified: true, logicalSessions: true, transactionalTopology: true, reason: "transaction_api_unavailable" });
      }
      await session.withTransaction(async () => {
        await connection.db.collection("pospackages").findOne({}, { session, projection: { _id: 1 } });
      }, REQUIRED_POS_TRANSACTION_OPTIONS);
    }
    return capability({
      supported: true,
      verified: true,
      logicalSessions: true,
      transactionalTopology: true,
      probePassed: true,
      reason: "transaction_probe_passed"
    });
  } catch {
    return capability({ verified: true, logicalSessions: true, transactionalTopology: true, reason: "transaction_probe_failed" });
  } finally {
    if (session && transactionStarted && !transactionAborted && typeof session.abortTransaction === "function") {
      await session.abortTransaction().catch(() => null);
    }
    if (session && typeof session.endSession === "function") {
      await session.endSession().catch(() => null);
    }
  }
}

module.exports = {
  REQUIRED_POS_TRANSACTION_OPTIONS,
  inspectMongoTransactionCapability
};
