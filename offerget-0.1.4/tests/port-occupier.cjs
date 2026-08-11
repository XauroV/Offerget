const http = require("node:http");

const port = Number(process.argv[2] || 3217);
http.createServer((_request, response) => {
  response.end("occupied");
}).listen(port, "127.0.0.1");
