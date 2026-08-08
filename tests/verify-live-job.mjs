const targetUrl = process.argv[2];

if (!targetUrl) {
  console.error("用法：node tests/verify-live-job.mjs <公开岗位链接>");
  process.exit(1);
}

const workerUrl = new URL("../dist/server/index.js", import.meta.url);
workerUrl.searchParams.set("live", `${Date.now()}`);
const { default: worker } = await import(workerUrl.href);

const response = await worker.fetch(
  new Request("http://localhost/api/analyze-job", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: targetUrl }),
  }),
  {
    ASSETS: {
      fetch: async () => new Response("Not found", { status: 404 }),
    },
  },
  {
    waitUntil() {},
    passThroughOnException() {},
  },
);

console.log(JSON.stringify(await response.json(), null, 2));
