#!/usr/bin/env node
/* eslint-disable jsdoc/require-jsdoc */
import { createReadStream } from "fs";
import { mkdir, readFile, rename, unlink } from "fs/promises";
import { join, resolve, sep } from "path";
import { StringDecoder } from "string_decoder";
import { finished } from "stream/promises";
import { createGunzip } from "zlib";
import { Client } from "pg";
import { from as copyFrom } from "pg-copy-streams";
import dotenv from "dotenv";
import { createRequire } from "module";

dotenv.config({ path: [".env.local", ".env"] });

const REGISTRY_HOST = "ghcr.io";
const ARTIFACT_NAME = "ponder-sync";
const OUTPUT_DIR = ".ponder";
const ARTIFACT_FILENAME = "ponder_sync.sql.gz";

const require = createRequire(import.meta.url);
const { OrasClient } = require("@dfatwork-pkgs/oras-client");

function requireMainnet() {
  if (process.env.ENVIRONMENT !== "mainnet") {
    console.log("Skipping cache download: ENVIRONMENT is not mainnet.");
    process.exit(0);
  }
}

function parseTagArg(argv) {
  const tagFlagIndex = argv.findIndex((arg) => arg === "--tag" || arg === "-t");
  if (tagFlagIndex !== -1) {
    return argv[tagFlagIndex + 1];
  }
  const positional = argv.find((arg) => !arg.startsWith("-"));
  return positional;
}

async function getRepoName() {
  const pkgRaw = await readFile(join(process.cwd(), "package.json"), "utf-8");
  const pkg = JSON.parse(pkgRaw);
  const repoField = pkg.repository;
  const repoValue = typeof repoField === "string" ? repoField : repoField?.url;
  if (!repoValue || repoValue.trim().length === 0) {
    throw new Error("package.json repository is missing");
  }
  const normalized = repoValue.replace(/^git\+/, "");
  const url = normalized.startsWith("http")
    ? normalized
    : `https://github.com/${normalized.replace(/^github:/, "")}`;
  return new URL(url).pathname.replace(/^\/+/, "").replace(/\.git$/, "");
}

export async function restorePonderSync(connectionString, filePath) {
  const outputRoot = resolve(process.cwd(), OUTPUT_DIR);
  const resolvedPath = resolve(filePath);
  if (!resolvedPath.startsWith(`${outputRoot}${sep}`)) {
    throw new Error("Invalid file path for restore");
  }
  if (!resolvedPath.endsWith(".sql.gz")) {
    throw new Error("Invalid cache file extension");
  }
  const client = new Client({ connectionString });
  await client.connect();
  await client.query("BEGIN");
  try {
    const input = createReadStream(filePath).pipe(createGunzip());
    const decoder = new StringDecoder("utf8");
    let buffer = "";
    let pendingSql = "";
    let copyStream = null;
    const flushSql = async () => {
      const trimmed = pendingSql.trim();
      if (!trimmed) {
        return;
      }
      await client.query(trimmed);
      pendingSql = "";
    };
    const handleLine = async (line) => {
      if (copyStream) {
        if (line === "\\.") {
          copyStream.end();
          await finished(copyStream);
          copyStream = null;
        } else {
          copyStream.write(`${line}\n`);
        }
        return;
      }
      const trimmed = line.trim();
      if (trimmed.startsWith("\\")) {
        return;
      }
      if (trimmed.startsWith("SET transaction_timeout")) {
        return;
      }
      if (trimmed.startsWith("COPY ") && trimmed.endsWith("FROM stdin;")) {
        await flushSql();
        copyStream = client.query(copyFrom(trimmed));
        return;
      }
      pendingSql += `${line}\n`;
      if (trimmed.endsWith(";")) {
        await flushSql();
      }
    };
    for await (const chunk of input) {
      buffer += decoder.write(chunk);
      let index = buffer.indexOf("\n");
      while (index !== -1) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 1);
        await handleLine(line);
        index = buffer.indexOf("\n");
      }
    }
    buffer += decoder.end();
    if (buffer.length > 0) {
      await handleLine(buffer);
    }
    if (copyStream) {
      const activeCopy = copyStream;
      activeCopy.end();
      await finished(activeCopy);
    }
    await flushSql();
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

export async function pullPonderSync(tag) {
  const repo = await getRepoName();
  const artifact = `${repo}/${ARTIFACT_NAME}`;
  const resolvedTag = tag ?? "latest";
  if (resolvedTag !== "latest" && !/^\d+$/.test(resolvedTag)) {
    throw new Error("Invalid tag format");
  }
  const client = new OrasClient();
  await mkdir(OUTPUT_DIR, { recursive: true });
  await client.pullArtifact(`${REGISTRY_HOST}/${artifact}:${resolvedTag}`, OUTPUT_DIR);
  const pulledPath = join(OUTPUT_DIR, ARTIFACT_FILENAME);
  const outputPath = join(OUTPUT_DIR, `${resolvedTag}_ponder_sync.sql.gz`);
  if (pulledPath !== outputPath) {
    try {
      await unlink(outputPath);
    } catch {
      // ignore missing destination
    }
    await rename(pulledPath, outputPath);
  }
  console.log(`Downloaded ${artifact}:${resolvedTag} to ${outputPath}`);
  return outputPath;
}

export async function main() {
  requireMainnet();
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString || connectionString.trim().length === 0) {
    throw new Error("DATABASE_URL is required for restore");
  }
  const argv = process.argv.slice(2);
  const tagArg = parseTagArg(argv);
  const outputPath = await pullPonderSync(tagArg);
  await restorePonderSync(connectionString, outputPath);
  console.log("Restore complete.");
}

main().catch((error) => {
  console.error("Failed to download and restore ponder_sync:", error);
  process.exit(1);
});
