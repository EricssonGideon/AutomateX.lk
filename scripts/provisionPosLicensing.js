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
  getPosLicensingProvisioningPlan,
  provisionPosLicensingDatabase,
  validatePosLicensingProvisioningPlan
} = require("../server/licensing/posLicensingProvisioning");

const APPLY_CONFIRMATION = "PROVISION_AUTOMATEX_POS_LICENSING";

function safePlan() {
  const plan = getPosLicensingProvisioningPlan();
  const validation = validatePosLicensingProvisioningPlan(plan);
  return {
    applyRequested: process.argv.includes("--apply"),
    valid: validation.valid,
    errors: validation.errors,
    collections: plan.map((entry) => ({
      collection: entry.collection,
      indexes: entry.indexes.map((index) => ({
        name: index.options.name,
        unique: index.options.unique === true
      }))
    }))
  };
}

async function main() {
  if (!process.argv.includes("--apply")) {
    process.stdout.write(`${JSON.stringify(safePlan(), null, 2)}\n`);
    return;
  }
  if (process.env.POS_LICENSING_PROVISION_CONFIRM !== APPLY_CONFIRMATION) {
    throw new Error("Explicit POS licensing provisioning confirmation is required.");
  }

  const config = validateProductionLicensingConfig(process.env);
  await mongoose.connect(
    config.secrets.getMongoUri(),
    getPosLicensingMongoConnectionOptions(config.databaseName)
  );
  const result = await provisionPosLicensingDatabase(mongoose.connection, { apply: true });
  process.stdout.write(`${JSON.stringify({ applied: result.applied, results: result.results }, null, 2)}\n`);
  await mongoose.disconnect();
}

main().catch(async () => {
  process.stderr.write("POS licensing provisioning failed closed.\n");
  await mongoose.disconnect().catch(() => null);
  process.exitCode = 1;
});
