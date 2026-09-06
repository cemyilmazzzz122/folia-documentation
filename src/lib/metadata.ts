import { environment } from "@raycast/api";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { CACHE_SCHEMA, docsBase, timeoutSignal } from "./constants";
import { DocEntry, MetaIndex } from "./types";

const META_TTL = 24 * 60 * 60 * 1000;

interface StoredMeta {
  fetchedAt: number;
  deprecated: string[];
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function metaFile(version: string): string {
  return path.join(environment.supportPath, `meta-${CACHE_SCHEMA}-${version}.json`);
}

// deprecated-list.html links straight back to the anchor of every deprecated
// class and member, in the exact page/anchor shape the search index already
// uses, so no separate id scheme is needed to match it against an entry.
async function download(version: string): Promise<StoredMeta> {
  const response = await fetch(docsBase(version) + "deprecated-list.html", {
    signal: timeoutSignal(),
  });
  if (!response.ok)
    throw new Error(`Failed to download deprecated-list.html (HTTP ${response.status})`);
  const html = await response.text();

  const deprecated = new Set<string>();
  const pattern = /href="([^"#]+)\.html(?:#([^"]+))?"/g;
  for (const match of html.matchAll(pattern)) {
    const page = `${match[1]}.html`;
    const anchor = match[2] ? safeDecode(match[2]) : "class-description";
    deprecated.add(`${page}|${anchor}`);
  }

  return { fetchedAt: Date.now(), deprecated: [...deprecated] };
}

async function readStored(version: string): Promise<StoredMeta | null> {
  try {
    const stored = JSON.parse(
      await readFile(metaFile(version), "utf8"),
    ) as StoredMeta;
    return stored.deprecated ? stored : null;
  } catch {
    return null;
  }
}

const cached = new Map<string, StoredMeta>();

async function ensureStored(version: string, force = false): Promise<StoredMeta> {
  const remembered = cached.get(version);
  if (remembered && !force && Date.now() - remembered.fetchedAt < META_TTL)
    return remembered;

  const stored = force ? null : await readStored(version);
  if (stored && Date.now() - stored.fetchedAt < META_TTL) {
    cached.set(version, stored);
    return stored;
  }

  try {
    const fresh = await download(version);
    await mkdir(environment.supportPath, { recursive: true });
    await writeFile(metaFile(version), JSON.stringify(fresh), "utf8");
    cached.set(version, fresh);
    return fresh;
  } catch (error) {
    const stale = stored ?? (await readStored(version));
    if (!stale) throw error;
    cached.set(version, stale);
    return stale;
  }
}

export async function ensureMeta(
  entries: DocEntry[],
  version: string,
  force = false,
): Promise<MetaIndex> {
  const stored = await ensureStored(version, force);
  const deprecated = new Set(stored.deprecated);

  const meta: MetaIndex = {};
  for (const entry of entries) {
    const isDeprecated = deprecated.has(`${entry.page}|${entry.anchor}`);
    const isLegacyScheduler = entry.pkg === "org.bukkit.scheduler";
    if (isDeprecated || isLegacyScheduler)
      meta[entry.name] = { deprecated: isDeprecated, legacyScheduler: isLegacyScheduler };
  }
  return meta;
}
