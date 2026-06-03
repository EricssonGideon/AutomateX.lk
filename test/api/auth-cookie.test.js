const assert = require("node:assert/strict");
const test = require("node:test");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = process.env.JWT_SECRET || "auth-cookie-test-secret";

const User = require("../../server/models/User");
const {
  AUTH_COOKIE_NAME,
  CSRF_COOKIE_NAME,
  parseCookies,
  verifyToken
} = require("../../server/middleware/auth");

const originalFindById = User.findById;

test.afterEach(() => {
  User.findById = originalFindById;
});

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

function createUser(overrides = {}) {
  return {
    _id: "507f1f77bcf86cd799439011",
    name: "Test User",
    email: "client@example.com",
    role: "client",
    isActive: true,
    status: "active",
    ...overrides
  };
}

function mockUserFind(user = createUser()) {
  User.findById = () => ({
    lean: async () => user
  });
}

function createToken(sub = "507f1f77bcf86cd799439011") {
  return jwt.sign({ sub }, process.env.JWT_SECRET, { expiresIn: "5m" });
}

async function runVerifyToken(reqOverrides = {}) {
  const req = {
    method: "GET",
    headers: {},
    ...reqOverrides
  };
  const res = createResponse();
  let nextCalled = false;

  await verifyToken(req, res, () => {
    nextCalled = true;
  });

  return { req, res, nextCalled };
}

test("cookie token authenticates safe requests", async () => {
  const token = createToken();
  mockUserFind();

  const { req, res, nextCalled } = await runVerifyToken({
    method: "GET",
    headers: {
      cookie: `${AUTH_COOKIE_NAME}=${token}`
    }
  });

  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, 200);
  assert.equal(req.authTokenSource, "cookie");
  assert.equal(req.user.id, "507f1f77bcf86cd799439011");
});

test("cookie token rejects unsafe requests without a matching CSRF token", async () => {
  const token = createToken();

  const { res, nextCalled } = await runVerifyToken({
    method: "POST",
    headers: {
      cookie: `${AUTH_COOKIE_NAME}=${token}; ${CSRF_COOKIE_NAME}=csrf-token`
    }
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.match(res.body.message, /CSRF token/);
});

test("cookie token authenticates unsafe requests with a matching CSRF token", async () => {
  const token = createToken();
  mockUserFind();

  const { req, res, nextCalled } = await runVerifyToken({
    method: "POST",
    headers: {
      cookie: `${AUTH_COOKIE_NAME}=${token}; ${CSRF_COOKIE_NAME}=csrf-token`,
      "x-csrf-token": "csrf-token"
    }
  });

  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, 200);
  assert.equal(req.authTokenSource, "cookie");
});

test("bearer token remains valid for unsafe requests during token transition", async () => {
  const token = createToken();
  mockUserFind();

  const { req, res, nextCalled } = await runVerifyToken({
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`
    }
  });

  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, 200);
  assert.equal(req.authTokenSource, "authorization");
});

test("malformed cookies are ignored instead of crashing authentication", () => {
  const cookies = parseCookies(`${AUTH_COOKIE_NAME}=%E0%A4%A; theme=dark`);

  assert.equal(cookies.theme, "dark");
  assert.equal(cookies[AUTH_COOKIE_NAME], undefined);
});
