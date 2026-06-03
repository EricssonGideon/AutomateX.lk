const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const test = require("node:test");

const Project = require("../../server/models/Project");
const Invoice = require("../../server/models/Invoice");
const ProjectFile = require("../../server/models/ProjectFile");
const AuditLog = require("../../server/models/AuditLog");
const { getClientProjectById } = require("../../server/controllers/projectController");
const { downloadClientInvoicePdf } = require("../../server/controllers/invoiceController");
const {
  downloadAdminProjectFile,
  downloadClientProjectFile
} = require("../../server/controllers/projectFileController");

const VALID_ID = "507f1f77bcf86cd799439011";
const CLIENT_ID = "507f1f77bcf86cd799439012";

const originalProjectFindOne = Project.findOne;
const originalInvoiceFindOne = Invoice.findOne;
const originalProjectFileFindOne = ProjectFile.findOne;
const originalAuditLogCreate = AuditLog.create;

test.afterEach(() => {
  Project.findOne = originalProjectFindOne;
  Invoice.findOne = originalInvoiceFindOne;
  ProjectFile.findOne = originalProjectFileFindOne;
  AuditLog.create = originalAuditLogCreate;
});

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    setHeader(name, value) {
      this.headers[name] = value;
      return this;
    },
    send(payload) {
      this.body = payload;
      return this;
    },
    download(filePath, fileName) {
      this.body = { filePath, fileName };
      return this;
    },
    redirect(url) {
      this.redirectUrl = url;
      return this;
    }
  };
}

function createClientRequest(paramName) {
  return {
    params: {
      [paramName]: VALID_ID
    },
    user: {
      id: CLIENT_ID,
      role: "client",
      email: "client@example.com"
    }
  };
}

function createAdminRequest(paramName) {
  return {
    params: {
      [paramName]: VALID_ID
    },
    user: {
      id: "507f1f77bcf86cd799439013",
      role: "admin",
      email: "admin@example.com"
    },
    headers: {},
    get() {
      return "";
    }
  };
}

test("client project detail lookup is scoped to the authenticated client", async () => {
  let capturedQuery = null;
  Project.findOne = (query) => {
    capturedQuery = query;
    return {
      lean: async () => null
    };
  };

  const res = createResponse();
  await getClientProjectById(createClientRequest("id"), res);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(capturedQuery, {
    _id: VALID_ID,
    clientId: CLIENT_ID,
    isArchived: false
  });
});

test("client invoice PDF lookup is scoped to the authenticated client", async () => {
  let capturedQuery = null;
  Invoice.findOne = (query) => {
    capturedQuery = query;
    return {
      lean: async () => null
    };
  };

  const res = createResponse();
  await downloadClientInvoicePdf(createClientRequest("id"), res);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(capturedQuery, {
    _id: VALID_ID,
    clientId: CLIENT_ID
  });
});

test("client project file downloads require ownership and client-visible active files", async () => {
  let capturedQuery = null;
  ProjectFile.findOne = (query) => {
    capturedQuery = query;
    return {
      lean: async () => null
    };
  };

  const res = createResponse();
  await downloadClientProjectFile(createClientRequest("fileId"), res);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(capturedQuery, {
    _id: VALID_ID,
    status: "Active",
    clientId: CLIENT_ID,
    visibility: "Client Visible"
  });
});

test("client cannot download an Admin Only project file", async () => {
  ProjectFile.findOne = (query) => ({
    lean: async () => {
      assert.equal(query.visibility, "Client Visible");
      return null;
    }
  });

  const res = createResponse();
  await downloadClientProjectFile(createClientRequest("fileId"), res);

  assert.equal(res.statusCode, 404);
});

test("client cannot download another client's project file", async () => {
  ProjectFile.findOne = (query) => ({
    lean: async () => {
      assert.equal(query.clientId, CLIENT_ID);
      return null;
    }
  });

  const res = createResponse();
  await downloadClientProjectFile(createClientRequest("fileId"), res);

  assert.equal(res.statusCode, 404);
});

test("authenticated admin can download a stored project file", async () => {
  const uploadDir = path.join(__dirname, "..", "..", "uploads", "project-files");
  const storedName = "admin-download-test.txt";
  const storagePath = path.join("uploads", "project-files", storedName);
  const absolutePath = path.join(uploadDir, storedName);

  fs.mkdirSync(uploadDir, { recursive: true });
  fs.writeFileSync(absolutePath, "admin file");

  ProjectFile.findOne = (query) => ({
    lean: async () => {
      assert.deepEqual(query, {
        _id: VALID_ID,
        status: "Active"
      });

      return {
        _id: VALID_ID,
        title: "Admin File",
        fileName: "admin-file.txt",
        storagePath,
        storageDriver: "local",
        fileSize: 10,
        status: "Active",
        visibility: "Admin Only"
      };
    }
  });
  AuditLog.create = async () => ({});

  try {
    const res = createResponse();
    await downloadAdminProjectFile(createAdminRequest("fileId"), res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.filePath, absolutePath);
    assert.equal(res.body.fileName, "admin-file.txt");
  } finally {
    fs.rmSync(absolutePath, { force: true });
  }
});
