const mongoose = require("mongoose");

const { loadRuntimeEnvironment } = require("../server/config/loadRuntimeEnvironment");

loadRuntimeEnvironment();

const {
  validateProductionLicensingConfig
} = require("../server/config/posLicensingProduction");
const {
  getPosLicensingMongoConnectionOptions
} = require("../server/config/posLicensingMongo");
const {
  runProductionLicensingReadinessGate
} = require("../server/licensing/posLicensingReadinessGate");

async function main() {
  let connection = null;
  let transactionCapability = null;
  try {
    const config = validateProductionLicensingConfig(process.env);
    await mongoose.connect(
      config.secrets.getMongoUri(),
      getPosLicensingMongoConnectionOptions(config.databaseName)
    );
    connection = mongoose.connection;
  } catch {
    transactionCapability = {
      supported: false,
      verified: false,
      logicalSessions: false,
      transactionalTopology: false,
      probePassed: false,
      reason: "database_connection_or_configuration_failed"
    };
  }

  const report = await runProductionLicensingReadinessGate({
    env: process.env,
    connection,
    transactionCapability
  });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  await mongoose.disconnect().catch(() => null);
  process.exitCode = report.eligibleForRouteMount ? 0 : 1;
}

main().catch(async () => {
  process.stdout.write(`${JSON.stringify({ ready: false, checks: [{ name: "readiness", passed: false, code: "readiness_check_failed" }] }, null, 2)}\n`);
  await mongoose.disconnect().catch(() => null);
  process.exitCode = 1;
});
