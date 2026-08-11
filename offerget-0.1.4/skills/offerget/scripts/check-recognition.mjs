#!/usr/bin/env node

const [url, baseUrl = "http://127.0.0.1:3001"] = process.argv.slice(2);

if (!url) {
  console.error("Usage: node check-recognition.mjs <job-url> [offerget-base-url]");
  process.exit(1);
}

const response = await fetch(new URL("/api/analyze-job", baseUrl), {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ url }),
});
const result = await response.json();
const fields = {
  company: result.company || "",
  title: result.title || "",
  publishedAt: result.publishedAt || "",
  deadline: result.deadline || "",
  location: result.location || "",
  jdLength: result.jd?.length || 0,
  requirementsLength: result.requirements?.length || 0,
  recognition: result.recognition || null,
};

console.log(JSON.stringify(fields, null, 2));
if (!response.ok || result.recognition?.status !== "complete") process.exit(2);
