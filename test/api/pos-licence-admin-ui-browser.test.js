const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

process.env.JWT_SECRET = process.env.JWT_SECRET || "pos-licence-admin-ui-browser-test-secret";

const PosPackage = require("../../server/models/PosPackage");
const PosActivationCode = require("../../server/models/PosActivationCode");
const {
  startPosLicenceAdminUiHarness
} = require("../../tools/pos-licence-admin-ui/harness");

const RUN_UI_BROWSER = process.env.AUTOMATEX_POS_UI_BROWSER === "1";
const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

let harness = null;
let chromeProcess = null;
let userDataDir = "";
let screenshotDir = "";
let cdp = null;

function executableExists(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
    server.on("error", reject);
  });
}

async function waitForJson(url) {
  let lastError = null;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return response.json();
      }
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw lastError || new Error(`Timed out waiting for ${url}`);
}

class CdpClient {
  constructor(ws) {
    this.ws = ws;
    this.id = 1;
    this.pending = new Map();
    ws.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) {
          reject(new Error(message.error.message || "CDP command failed."));
        } else {
          resolve(message.result || {});
        }
      }
    });
  }

  send(method, params = {}) {
    const id = this.id;
    this.id += 1;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }

  close() {
    this.ws.close();
  }
}

async function connectCdp(webSocketDebuggerUrl) {
  const ws = new WebSocket(webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
  return new CdpClient(ws);
}

async function createChromePage(remotePort) {
  let target = null;
  const newUrl = `http://127.0.0.1:${remotePort}/json/new?about:blank`;
  let response = await fetch(newUrl, { method: "PUT" }).catch(() => null);
  if (!response || !response.ok) {
    response = await fetch(newUrl).catch(() => null);
  }
  if (response && response.ok) {
    target = await response.json();
  } else {
    const targets = await waitForJson(`http://127.0.0.1:${remotePort}/json/list`);
    target = targets.find((item) => item.type === "page");
  }
  if (!target || !target.webSocketDebuggerUrl) {
    throw new Error("Unable to create a Chrome DevTools Protocol page target.");
  }
  return connectCdp(target.webSocketDebuggerUrl);
}

async function startChrome() {
  if (!executableExists(CHROME_PATH)) {
    throw new Error(`Chrome executable not found at ${CHROME_PATH}`);
  }
  const remotePort = await getFreePort();
  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "automatex-pos-ui-chrome-"));
  chromeProcess = childProcess.spawn(CHROME_PATH, [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    `--user-data-dir=${userDataDir}`,
    `--remote-debugging-port=${remotePort}`,
    "about:blank"
  ], { stdio: ["ignore", "pipe", "pipe"] });
  await waitForJson(`http://127.0.0.1:${remotePort}/json/version`);
  cdp = await createChromePage(remotePort);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 1366,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false
  });
}

async function evaluate(expression) {
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || "Browser evaluation failed.");
  }
  return result.result ? result.result.value : undefined;
}

async function waitUntil(expression, timeoutMs = 5000) {
  const started = Date.now();
  let lastValue = null;
  while (Date.now() - started < timeoutMs) {
    lastValue = await evaluate(expression);
    if (lastValue) {
      return lastValue;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for browser condition: ${expression}. Last value: ${lastValue}`);
}

async function navigate(url) {
  await cdp.send("Page.navigate", { url });
  await waitUntil("document.readyState === 'complete'");
}

function jsString(value) {
  return JSON.stringify(value);
}

async function click(selector) {
  await evaluate(`document.querySelector(${jsString(selector)}).click()`);
}

async function setValue(selector, value) {
  await evaluate(`
    (() => {
      const element = document.querySelector(${jsString(selector)});
      element.value = ${jsString(value)};
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    })()
  `);
}

async function checkByValue(name, value) {
  await evaluate(`
    (() => {
      const element = Array.from(document.querySelectorAll(${jsString(`input[name="${name}"]`)}))
        .find((input) => input.value === ${jsString(value)});
      if (element) {
        element.checked = true;
        element.dispatchEvent(new Event('change', { bubbles: true }));
      }
    })()
  `);
}

async function pageText(selector) {
  return evaluate(`document.querySelector(${jsString(selector)})?.textContent || ""`);
}

async function browserRequest(pathName, options = {}) {
  return evaluate(`
    (async () => {
      const csrf = document.cookie.split(';').map((part) => part.trim())
        .find((part) => part.startsWith('automatex_csrf='))?.slice('automatex_csrf='.length) || '';
      const response = await fetch(${jsString(pathName)}, {
        method: ${jsString(options.method || "GET")},
        credentials: 'same-origin',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': csrf
        },
        body: ${options.body ? jsString(JSON.stringify(options.body)) : "undefined"}
      });
      return {
        status: response.status,
        cacheControl: response.headers.get('cache-control') || '',
        body: await response.json().catch(() => ({}))
      };
    })()
  `);
}

async function browserRequestWithoutCsrf(pathName, body) {
  return evaluate(`
    (async () => {
      const response = await fetch(${jsString(pathName)}, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: ${jsString(JSON.stringify(body))}
      });
      return { status: response.status, body: await response.json().catch(() => ({})) };
    })()
  `);
}

async function saveScreenshot(name) {
  const result = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
  const filePath = path.join(screenshotDir, `${name}.png`);
  fs.writeFileSync(filePath, Buffer.from(result.data, "base64"));
  return filePath;
}

async function loginAs(role) {
  await setValue("#fixture-role", role);
  await click("#login-button");
}

async function fillPackageDraft(code, name) {
  await setValue("#package-code", code);
  await setValue("#package-name", name);
  await checkByValue("packageModule", "reports");
  await checkByValue("packageChannel", "stable");
}

async function submitPackageAndWait(messageText = "Saved.") {
  await click("#package-save");
  await waitUntil(`document.querySelector('#package-form-message')?.textContent.includes(${jsString(messageText)})`);
}

async function fillLicenceDraft(clientId, projectId, packageId, licenceExpiry) {
  await setValue("#licence-client", clientId);
  if (projectId) {
    await setValue("#licence-project", projectId);
  }
  if (packageId) {
    await setValue("#licence-package", packageId);
    await checkByValue("licenceModule", "reports");
    await setValue("#licence-update-channel", "stable");
  }
  if (licenceExpiry) {
    await setValue("#licence-expiry", licenceExpiry);
  }
}

if (!RUN_UI_BROWSER) {
  test("POS licensing admin UI browser verification requires explicit opt-in", {
    skip: "Set AUTOMATEX_POS_UI_BROWSER=1 to run the isolated Chrome/MongoDB UI test."
  }, () => {});
} else {
  test.before(async () => {
    assert.equal(typeof WebSocket, "function", "Node WebSocket support is required for Chrome DevTools Protocol tests.");
    screenshotDir = fs.mkdtempSync(path.join(os.tmpdir(), "automatex-pos-ui-screens-"));
    harness = await startPosLicenceAdminUiHarness();
    await startChrome();
    await navigate(harness.baseUrl);
  });

  test.after(async () => {
    if (cdp) {
      cdp.close();
      cdp = null;
    }
    if (chromeProcess) {
      chromeProcess.kill("SIGTERM");
      await new Promise((resolve) => chromeProcess.once("exit", resolve));
      chromeProcess = null;
    }
    if (userDataDir && userDataDir.startsWith(path.join(os.tmpdir(), "automatex-pos-ui-chrome-"))) {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
    if (harness) {
      await harness.stop();
      harness = null;
    }
  });

  test("isolated POS licensing UI drives real auth, CSRF, lifecycle and activation-code API flows", async (t) => {
    const clientId = String(harness.fixtures.clients[0]._id);
    const projectId = String(harness.fixtures.projects[0]._id);
    const otherProjectId = String(harness.fixtures.projects[1]._id);

    await saveScreenshot("desktop-initial");
    assert.match(await pageText("body"), /Local test environment - production activation is not connected/);
    assert.match(await pageText("body"), /Neither means the POS has been activated/);
    assert.equal(await evaluate("localStorage.length"), 0);
    assert.equal(await evaluate("sessionStorage.length"), 0);

    await loginAs("manager");
    await waitUntil("document.querySelector('#session-status')?.textContent.includes('permission')");
    assert.match(await pageText("#session-status"), /permission/);

    await loginAs("admin");
    await waitUntil("document.querySelector('#package-list')?.textContent.includes('No draft packages')");
    assert.match(await pageText("#licence-list"), /No draft licences/);

    await fillPackageDraft("standard-ui-main", "UI Standard Package");
    await submitPackageAndWait();
    let packageId = await evaluate("document.querySelector('#package-id').value");
    let packageVersion = Number(await evaluate("document.querySelector('#package-version').value"));
    assert.ok(packageId);
    assert.equal(packageVersion, 0);
    assert.match(await pageText("#package-list"), /UI Standard Package/);

    await setValue("#package-name", "UI Standard Package Edited");
    await submitPackageAndWait();
    packageVersion = Number(await evaluate("document.querySelector('#package-version').value"));
    assert.equal(packageVersion, 1);

    await click("#new-licence-button");
    await fillLicenceDraft(clientId, "", "", "");
    await click("#licence-save");
    await waitUntil("document.querySelector('#licence-form-message')?.textContent.includes('Saved.')");
    assert.match(await pageText("#licence-list"), /Fixture Client <img src=x onerror=alert\(1\)>/);
    assert.equal(await evaluate("Boolean(document.querySelector('#licence-list img'))"), false);
    await evaluate("document.querySelector('#licence-list .record-card .record-actions button:nth-child(2)').click()");
    await waitUntil("document.querySelector('#readiness-output')?.textContent.includes('Not ready')");
    assert.match(await pageText("#readiness-output"), /POS project|package|expiry/);

    await click("#new-licence-button");
    await fillLicenceDraft(clientId, projectId, packageId, "2026-12-31");
    await click("#licence-save");
    await waitUntil("document.querySelector('#licence-form-message')?.textContent.includes('Saved.')");
    await setValue("#licence-notes", "Licence edited through browser");
    await click("#licence-save");
    await waitUntil("document.querySelector('#licence-form-message')?.textContent.includes('Saved.')");
    assert.match(await pageText("#licence-list"), /Fixture POS Project/);

    const mismatch = await browserRequest("/pos-admin/licences", {
      method: "POST",
      body: {
        clientId,
        projectId: otherProjectId,
        packageId,
        edition: "standard",
        entitledModules: ["dashboard", "billing", "products", "inventory", "customers", "sales", "backup", "settings"],
        updateChannel: "stable",
        licenceExpiry: "2026-12-31T00:00:00.000Z"
      }
    });
    assert.equal(mismatch.status, 400);
    assert.match(mismatch.body.message, /validation/i);

    await click("#new-package-button");
    await fillPackageDraft("standard-ui-main", "Duplicate Package");
    await click("#package-save");
    await waitUntil("document.querySelector('#package-form-message')?.textContent.includes('already exists')");
    assert.match(await pageText("#package-form-message"), /already exists/);

    await evaluate(`
      (() => {
        const cards = Array.from(document.querySelectorAll('#package-list .record-card'));
        const target = cards.find((card) => card.textContent.includes('UI Standard Package Edited'));
        target.querySelector('button').click();
      })()
    `);
    packageVersion = Number(await evaluate("document.querySelector('#package-version').value"));
    const serverUpdate = await browserRequest(`/pos-admin/packages/${packageId}`, {
      method: "PATCH",
      body: {
        expectedVersion: packageVersion,
        name: "Server-side newer package value"
      }
    });
    assert.equal(serverUpdate.status, 200);
    await setValue("#package-name", "Preserved stale package value");
    await click("#package-save");
    await waitUntil("document.querySelector('#package-form-message')?.textContent.includes('changed by another writer')");
    assert.equal(await evaluate("document.querySelector('#package-name').value"), "Preserved stale package value");
    assert.equal(await evaluate("!document.querySelector('#package-reload').classList.contains('hidden')"), true);

    await click("#package-reload");
    await waitUntil("document.querySelector('#package-form-message')?.textContent.includes('Reloaded')");
    const auditMode = await browserRequest("/__fixtures/audit-failure", { method: "POST", body: {} });
    assert.equal(auditMode.status, 200);
    await setValue("#package-name", "Package saved with audit warning");
    await click("#package-save");
    await waitUntil("document.querySelector('#package-form-message')?.textContent.includes('could not be confirmed')");
    assert.match(await pageText("#package-form-message"), /Saved\..*audit logging could not be confirmed/);

    const missingCsrf = await browserRequestWithoutCsrf("/pos-admin/packages", {
      packageCode: "standard-ui-missing-csrf",
      name: "Missing CSRF",
      edition: "standard",
      moduleIds: ["dashboard", "billing", "products", "inventory", "customers", "sales", "backup", "settings"],
      updateChannels: ["stable"]
    });
    assert.equal(missingCsrf.status, 403);

    await click("#new-package-button");
    await fillPackageDraft("standard-ui-double", "Double Submit Package");
    await evaluate(`
      (() => {
        const button = document.querySelector('#package-save');
        button.click();
        button.click();
      })()
    `);
    await waitUntil("document.querySelector('#package-form-message')?.textContent.includes('Saved.')");
    assert.equal(await PosPackage.countDocuments({ packageCode: "standard-ui-double" }), 1);

    await evaluate(`
      (() => {
        window.confirm = () => true;
        const cards = Array.from(document.querySelectorAll('#package-list .record-card'));
        const target = cards.find((card) => card.textContent.includes('Package saved with audit warning'));
        target.querySelector('button').click();
      })()
    `);
    await waitUntil("document.querySelector('#package-id')?.value === " + jsString(packageId));
    packageVersion = Number(await evaluate("document.querySelector('#package-version').value"));
    await click("#package-publish");
    await waitUntil("document.querySelector('#package-form-message')?.textContent.includes('Published.')");
    assert.equal(await evaluate("document.querySelector('#package-save').disabled"), true);
    assert.match(await pageText("#package-list"), /status: active/);

    const unpublishedPackage = await browserRequest("/pos-admin/packages", {
      method: "POST",
      body: {
        packageCode: "standard-ui-unpublished",
        name: "UI Unpublished Package",
        edition: "standard",
        moduleIds: ["dashboard", "billing", "products", "inventory", "customers", "sales", "backup", "settings", "reports"],
        updateChannels: ["stable"]
      }
    });
    assert.equal(unpublishedPackage.status, 201);
    const licenceAgainstUnpublished = await browserRequest("/pos-admin/licences", {
      method: "POST",
      body: {
        clientId,
        projectId,
        packageId: unpublishedPackage.body.package.id,
        edition: "standard",
        entitledModules: ["dashboard", "billing", "products", "inventory", "customers", "sales", "backup", "settings"],
        updateChannel: "stable",
        licenceExpiry: "2026-12-31T00:00:00.000Z"
      }
    });
    assert.equal(licenceAgainstUnpublished.status, 201);
    const approvalAgainstUnpublished = await browserRequest(`/pos-admin/licences/${licenceAgainstUnpublished.body.licence.id}/approve`, {
      method: "POST",
      body: {
        expectedVersion: licenceAgainstUnpublished.body.licence.version,
        reason: "Browser unpublished package check"
      }
    });
    assert.equal(approvalAgainstUnpublished.status, 400);

    await click("#new-licence-button");
    await fillLicenceDraft(clientId, projectId, packageId, "2026-12-31");
    await click("#licence-save");
    await waitUntil("document.querySelector('#licence-form-message')?.textContent.includes('Saved.')");
    const approvalLicenceId = await evaluate("document.querySelector('#licence-id').value");
    const approvalLicenceVersion = Number(await evaluate("document.querySelector('#licence-version').value"));
    await setValue("#licence-notes", "Ready for local approval");
    await click("#licence-save");
    await waitUntil("document.querySelector('#licence-form-message')?.textContent.includes('Saved.')");
    const updatedLicenceVersion = Number(await evaluate("document.querySelector('#licence-version').value"));
    assert.equal(updatedLicenceVersion, approvalLicenceVersion + 1);
    await click("#licence-approve");
    await waitUntil("document.querySelector('#licence-form-message')?.textContent.includes('Approved.')");
    assert.equal(await evaluate("document.querySelector('#licence-save').disabled"), true);
    assert.match(await pageText("#licence-list"), /status: active/);

    const publishedPackageEdit = await browserRequest(`/pos-admin/packages/${packageId}`, {
      method: "PATCH",
      body: {
        expectedVersion: packageVersion + 1,
        name: "No edit after publish"
      }
    });
    assert.equal(publishedPackageEdit.status, 409);

    await evaluate(`
      (() => {
        const cards = Array.from(document.querySelectorAll('#licence-list .record-card'));
        const target = cards.find((card) => card.textContent.includes('Ready for local approval') || card.textContent.includes('status: active'));
        const codes = Array.from(target.querySelectorAll('button')).find((button) => button.textContent.trim() === 'Codes');
        codes.click();
      })()
    `);
    await waitUntil("document.querySelector('#activation-licence-id')?.value === " + jsString(approvalLicenceId));
    await setValue("#activation-expiry", "2026-10-01T00:00");
    await setValue("#activation-max-redemptions", "1");
    await evaluate(`
      (() => {
        const button = document.querySelector('#activation-issue');
        button.click();
        button.click();
      })()
    `);
    await waitUntil("!document.querySelector('#activation-code-display').classList.contains('hidden')");
    assert.match(await pageText("#activation-form-message"), /Issued\. Plaintext is shown once/);
    const plaintextCode = await pageText("#activation-plaintext");
    assert.match(plaintextCode, /^posac_[a-f0-9]{32}$/);
    assert.equal(await PosActivationCode.countDocuments({ licenceId: approvalLicenceId }), 1);
    const metadata = await browserRequest(`/pos-admin/licences/${approvalLicenceId}/activation-codes`);
    assert.equal(metadata.status, 200);
    assert.match(metadata.cacheControl, /no-store/);
    assert.equal(metadata.body.activationCodes.length, 1);
    assert.equal(JSON.stringify(metadata.body).includes(plaintextCode), false);
    assert.equal(JSON.stringify(metadata.body).includes("codeHash"), false);
    assert.equal(JSON.stringify(metadata.body).includes("sha256:"), false);
    assert.equal(await evaluate(`location.href.includes(${jsString(plaintextCode)})`), false);
    assert.equal(await evaluate(`JSON.stringify(localStorage).includes(${jsString(plaintextCode)})`), false);
    assert.equal(await evaluate(`JSON.stringify(sessionStorage).includes(${jsString(plaintextCode)})`), false);

    await click("#activation-dismiss");
    await waitUntil("document.querySelector('#activation-code-display').classList.contains('hidden')");
    assert.equal(await pageText("#activation-plaintext"), "");
    assert.equal((await pageText("body")).includes(plaintextCode), false);

    await evaluate("document.querySelector('#activation-code-list .record-actions button').click()");
    await waitUntil("document.querySelector('#activation-form-message')?.textContent.includes('Revoked unused activation code')");
    const revokedMetadata = await browserRequest(`/pos-admin/licences/${approvalLicenceId}/activation-codes`);
    assert.equal(revokedMetadata.body.activationCodes[0].status, "revoked");
    const secondRevoke = await browserRequest(`/pos-admin/activation-codes/${revokedMetadata.body.activationCodes[0].id}/revoke-unused`, {
      method: "POST",
      body: {}
    });
    assert.equal(secondRevoke.status, 409);

    await evaluate(`
      (() => {
        const originalFetch = window.fetch.bind(window);
        window.__activationPostCount = 0;
        window.__restoreFetch = () => { window.fetch = originalFetch; };
        window.fetch = (input, init) => {
          const url = String(input);
          if (url.includes('/activation-codes') && init && init.method === 'POST') {
            window.__activationPostCount += 1;
            return Promise.reject(new TypeError('fixture network uncertainty'));
          }
          return originalFetch(input, init);
        };
      })()
    `);
    await setValue("#activation-expiry", "2026-10-15T00:00");
    await setValue("#activation-max-redemptions", "1");
    await click("#activation-issue");
    await waitUntil("document.querySelector('#activation-form-message')?.textContent.includes('Request outcome is uncertain')");
    assert.equal(await evaluate("window.__activationPostCount"), 1);
    assert.equal(await PosActivationCode.countDocuments({ licenceId: approvalLicenceId }), 1);
    await evaluate("window.__restoreFetch()");

    const badStorage = await evaluate(`
      (() => {
        localStorage.setItem('probe', 'ok');
        const tokenKeys = Object.keys(localStorage).filter((key) => /token|credential|auth/i.test(key));
        localStorage.removeItem('probe');
        return tokenKeys;
      })()
    `);
    assert.deepEqual(badStorage, []);

    const accessibilityProblems = await evaluate(`
      (() => Array.from(document.querySelectorAll('input:not([type="hidden"]), select, textarea, button'))
        .filter((element) => {
          if (element.tagName === 'BUTTON') return !element.textContent.trim();
          if (element.closest('fieldset')) return false;
          return !element.id || !document.querySelector('label[for="' + CSS.escape(element.id) + '"]');
        })
        .map((element) => element.id || element.tagName))()
    `);
    assert.deepEqual(accessibilityProblems, []);
    await evaluate("document.querySelector('#login-button').focus()");
    assert.equal(await evaluate("document.activeElement.id"), "login-button");

    let sawRateLimit = false;
    for (let attempt = 0; attempt < 90; attempt += 1) {
      const limited = await browserRequest("/pos-admin/packages/not-an-id/publish", {
        method: "POST",
        body: { expectedVersion: 0 }
      });
      if (limited.status === 429) {
        sawRateLimit = true;
        assert.match(limited.body.message, /Too many POS licensing administration actions/);
        break;
      }
    }
    assert.equal(sawRateLimit, true);

    const desktopPath = await saveScreenshot("desktop-completed");
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 900,
      deviceScaleFactor: 1,
      mobile: true
    });
    await waitUntil("document.body.scrollWidth <= window.innerWidth + 1");
    const mobilePath = await saveScreenshot("mobile-completed");
    t.diagnostic(`POS licensing UI screenshots: ${desktopPath} ${mobilePath}`);
  });
}
