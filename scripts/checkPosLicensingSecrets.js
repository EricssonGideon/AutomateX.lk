const path = require("node:path");
const { spawnSync } = require("node:child_process");

const {
  scanFilesForPosSecrets,
  summarizeSecretScan
} = require("../server/security/posSecretScanner");

const projectRoot = path.join(__dirname, "..");

function repositoryFiles() {
  const result = spawnSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
    cwd: projectRoot,
    encoding: "utf8"
  });
  if (result.status !== 0) {
    throw new Error("Unable to enumerate repository files for POS secret scanning.");
  }
  return result.stdout
    .split("\0")
    .filter(Boolean)
    .map((file) => path.join(projectRoot, file));
}

function main() {
  const files = repositoryFiles();
  const findings = scanFilesForPosSecrets(files);
  const report = {
    ok: findings.length === 0,
    filesScanned: files.length,
    findings: summarizeSecretScan(findings, projectRoot)
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = report.ok ? 0 : 1;
}

try {
  main();
} catch {
  process.stderr.write("POS licensing secret scan failed safely.\n");
  process.exitCode = 1;
}
