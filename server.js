// Production entry file (Hostinger "Entry file": server.js).
// Starts the built Next.js app on the port the host provides.
const { createServer } = require('http');
const next = require('next');

const port = Number(process.env.PORT) || 3000;
const app = next({ dev: false, dir: __dirname });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer((req, res) => handle(req, res)).listen(port, () => {
    console.log(`Kainlee Invitations running on port ${port}`);
  });
}).catch((err) => {
  console.error('Failed to start', err);
  process.exit(1);
});
