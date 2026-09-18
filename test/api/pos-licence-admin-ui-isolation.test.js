const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

function rootDir() {
  return path.join(__dirname, "..", "..");
}

function read(relativePath) {
  return fs.readFileSync(path.join(rootDir(), relativePath), "utf8");
}

test("POS licensing draft UI remains outside production startup and public assets", () => {
  const uiFiles = [
    "tools/pos-licence-admin-ui/index.html",
    "tools/pos-licence-admin-ui/pos-licence-admin-ui.css",
    "tools/pos-licence-admin-ui/pos-licence-admin-ui.js"
  ];

  uiFiles.forEach((relativePath) => {
    assert.equal(fs.existsSync(path.join(rootDir(), relativePath)), true);
    assert.equal(relativePath.startsWith("public/"), false);
  });

  [
    "server.js",
    "server/server.js",
    "server/routes/index.js"
  ].forEach((relativePath) => {
    const source = read(relativePath);
    assert.doesNotMatch(source, /posLicenceAdmin|posLicenceAdminController|posLicenceAdminService/);
    assert.doesNotMatch(source, /pos-licence-admin-ui|startPosLicenceAdminUiHarness/);
  });

  const publicFiles = fs.existsSync(path.join(rootDir(), "public"))
    ? fs.readdirSync(path.join(rootDir(), "public"), { recursive: true })
    : [];
  assert.deepEqual(
    publicFiles.filter((fileName) => String(fileName).includes("pos-licence-admin-ui")),
    []
  );

  const uiSource = read("tools/pos-licence-admin-ui/pos-licence-admin-ui.js");
  assert.doesNotMatch(uiSource, /localStorage\.setItem|sessionStorage\.setItem/);
});
