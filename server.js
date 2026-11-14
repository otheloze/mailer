const { createServer } = require("node:http");
const next = require("next");

if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = "production";
}

const port = Number.parseInt(process.env.PORT || "3000", 10);
const hostname = "0.0.0.0";
const app = next({ dev: false, hostname, port });
const handle = app.getRequestHandler();

app.prepare()
  .then(() => {
    const server = createServer((request, response) => handle(request, response));
    server.on("error", (error) => {
      console.error("Next.js server failed to start:", error);
      process.exitCode = 1;
    });
    server.listen(port, hostname, () => {
      console.log(`MYMAILMARKET is listening on port ${port}`);
    });
  })
  .catch((error) => {
    console.error("Next.js application failed to prepare:", error);
    process.exitCode = 1;
  });
