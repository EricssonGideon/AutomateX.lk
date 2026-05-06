const express = require("express");
const app = express();

// your middlewares
app.use(express.json());

// your routes
app.use("/api/auth", require("./routes/auth"));
// add other routes here...

// REMOVE app.listen ❌
// app.listen(3000);

const serverless = require("serverless-http");
module.exports = serverless(app);
