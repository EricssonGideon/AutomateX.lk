const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const rootDir = path.join(__dirname, "..", "..");
const publicDir = path.join(rootDir, "public");

const hardenedHtmlFiles = [
  "admin.html",
  "dashboard.html",
  "login.html",
  "admin-login.html",
  "client-login.html",
  "pricing.html"
];

const publicHtmlFiles = fs.readdirSync(publicDir)
  .filter((fileName) => fileName.endsWith(".html"));

const tailwindBackedHtmlFiles = [
  "dashboard.html",
  "login.html",
  "admin-login.html",
  "client-login.html",
  "pricing.html"
];

function readPublicFile(relativePath) {
  return fs.readFileSync(path.join(publicDir, relativePath), "utf8");
}

test("hardened static HTML pages do not contain inline scripts or styles", () => {
  hardenedHtmlFiles.forEach((fileName) => {
    const html = readPublicFile(fileName);

    assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/i, `${fileName} should not contain inline script blocks`);
    assert.doesNotMatch(html, /<style[\s>]/i, `${fileName} should not contain inline style blocks`);
    assert.doesNotMatch(html, /\sstyle\s*=/i, `${fileName} should not contain inline style attributes`);
    assert.doesNotMatch(html, /\s(onclick|onchange|oninput|onsubmit|onkeydown|onkeyup|onload|onerror)\s*=/i, `${fileName} should not contain inline event handlers`);
  });
});

test("public HTML pages do not reference Tailwind CDN or Google Fonts", () => {
  publicHtmlFiles.forEach((fileName) => {
    const html = readPublicFile(fileName);

    assert.doesNotMatch(html, /https:\/\/cdn\.tailwindcss\.com/i, `${fileName} should not load Tailwind from CDN`);
    assert.doesNotMatch(html, /tailwind\.config|pricing-tailwind-config/i, `${fileName} should not use Tailwind runtime config`);
    assert.doesNotMatch(html, /fonts\.googleapis\.com|fonts\.gstatic\.com/i, `${fileName} should not load Google Fonts`);
  });
});

test("Tailwind-backed pages reference the local compiled CSS asset", () => {
  const tailwindCss = path.join(publicDir, "assets/css/tailwind.css");

  assert.ok(fs.existsSync(tailwindCss), "compiled Tailwind CSS asset should exist");
  assert.ok(fs.statSync(tailwindCss).size > 0, "compiled Tailwind CSS asset should not be empty");

  tailwindBackedHtmlFiles.forEach((fileName) => {
    assert.match(readPublicFile(fileName), /\/assets\/css\/tailwind\.css/, `${fileName} should reference local Tailwind CSS`);
  });
});

test("admin and client pages reference extracted static assets", () => {
  assert.match(readPublicFile("admin.html"), /\/assets\/js\/admin\.js/);
  assert.match(readPublicFile("admin.html"), /\/assets\/css\/admin\.css/);
  assert.match(readPublicFile("dashboard.html"), /\/assets\/js\/dashboard-theme\.js/);
  assert.match(readPublicFile("dashboard.html"), /\/assets\/js\/dashboard\.js/);
  assert.match(readPublicFile("dashboard.html"), /\/assets\/css\/dashboard\.css/);
  assert.match(readPublicFile("login.html"), /\/assets\/js\/login\.js/);
  assert.match(readPublicFile("admin-login.html"), /\/assets\/js\/admin-login\.js/);
  assert.match(readPublicFile("client-login.html"), /\/assets\/js\/client-login\.js/);
});

test("extracted frontend scripts parse successfully", () => {
  const scriptFiles = [
    "app.js",
    "assets/js/admin-login.js",
    "assets/js/admin.js",
    "assets/js/client-login.js",
    "assets/js/dashboard-theme.js",
    "assets/js/dashboard.js",
    "assets/js/login.js",
    "assets/js/pricing.js"
  ];

  scriptFiles.forEach((relativePath) => {
    execFileSync(process.execPath, ["--check", path.join(publicDir, relativePath)], {
      stdio: "pipe"
    });
  });
});

test("authenticated frontend fetch helpers keep CSRF headers", () => {
  const adminScript = readPublicFile("assets/js/admin.js");
  const dashboardScript = readPublicFile("assets/js/dashboard.js");

  assert.match(adminScript, /"X-CSRF-Token"/);
  assert.match(adminScript, /Authorization:\s*`Bearer \$\{token\}`/);
  assert.match(dashboardScript, /"X-CSRF-Token"/);
  assert.match(dashboardScript, /Authorization:\s*`Bearer \$\{token\}`/);
});

test("Helmet CSP configuration removes unsafe inline scripts", () => {
  const serverSource = fs.readFileSync(path.join(rootDir, "server/server.js"), "utf8");

  assert.match(serverSource, /"script-src": \["'self'"\]/);
  assert.doesNotMatch(serverSource, /"script-src": \[[^\]]*"'unsafe-inline'"/);
  assert.doesNotMatch(serverSource, /"script-src": \[[^\]]*cdn\.tailwindcss\.com/);
  assert.match(serverSource, /"style-src": \["'self'"\]/);
  assert.doesNotMatch(serverSource, /"style-src": \[[^\]]*"'unsafe-inline'"/);
  assert.match(serverSource, /"font-src": \["'self'"\]/);
  assert.match(serverSource, /"script-src-attr": \["'none'"\]/);
  assert.match(serverSource, /"object-src": \["'none'"\]/);
});
