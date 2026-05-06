const app = require("./server/server");

const port = Number(process.env.PORT) || 5000;

if (require.main === module) {
  app.connectToDatabase()
    .then(() => {
      app.listen(port, () => {
        console.log(`AutomateX server running on http://localhost:${port}`);
      });
    })
    .catch((error) => {
      console.error("Failed to start server:", error.message);
      process.exit(1);
    });
}

module.exports = app;
