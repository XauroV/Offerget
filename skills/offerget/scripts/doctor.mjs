#!/usr/bin/env node

import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const skillDirectory = path.resolve(scriptDirectory, "..");

async function readable(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function savedRepositoryPath() {
  try {
    return (await readFile(path.join(skillDirectory, "references", "repo-path.txt"), "utf8")).trim();
  } catch {
    return "";
  }
}

async function resolveRepository() {
  const candidates = [
    process.env.OFFERGET_REPO,
    await savedRepositoryPath(),
    process.cwd(),
    path.resolve(skillDirectory, "..", ".."),
  ].filter(Boolean);

  for (const candidate of candidates) {
    const packageFile = path.resolve(candidate, "package.json");
    if (!await readable(packageFile)) continue;
    try {
      const manifest = JSON.parse(await readFile(packageFile, "utf8"));
      if (manifest.productName === "offerget") return path.resolve(candidate);
    } catch {
      // Continue to the next candidate.
    }
  }
  return "";
}

async function health(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
      signal: AbortSignal.timeout(700),
    });
    return response.ok;
  } catch {
    return false;
  }
}

const repository = await resolveRepository();
const [major, minor] = process.versions.node.split(".").map(Number);
const supportedNode = major > 22 || (major === 22 && minor >= 13);
const dataFile = repository
  ? path.join(process.env.OFFERGET_DATA_DIR || path.join(repository, ".offerget"), "state.json")
  : "";

const result = {
  repository,
  node: process.versions.node,
  supportedNode,
  dataFile,
  dataFileExists: dataFile ? await readable(dataFile) : false,
  servers: {
    3001: await health(3001),
    3217: await health(3217),
  },
};

console.log(JSON.stringify(result, null, 2));
if (!repository || !supportedNode) process.exit(1);
