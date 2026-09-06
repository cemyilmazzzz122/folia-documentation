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
  return path.join(
    environment.supportPath,
    `meta-${CACHE_SCHEMA}-${version}.json`,
  );
}

// deprecated-list.html links straight back to the anchor of every deprecated
// class and member, in the exact page/anchor shape the search index already
// uses. Only the "col-summary-item-name" link is the deprecated element's own
// link, though: the "col-last" description next to it is free Javadoc text
// ("use Player.setResourcePack(...) instead") that can itself link to
// unrelated, non-deprecated classes, so scanning the whole page for hrefs
// would misfile something like Player itself as deprecated.
async function download(version: string): Promise<StoredMeta> {
  const response = await fetch(docsBase(version) + "deprecated-list.html", {
    signal: timeoutSignal(),
  });
  if (!response.ok)
    throw new Error(
      `Failed to download deprecated-list.html (HTTP ${response.status})`,
    );
  const html = await response.text();

  const deprecated = new Set<string>();
  const itemPattern =
    /<div class="col-summary-item-name[^"]*">([\s\S]*?)<\/div>/g;
  const hrefPattern = /href="([^"#]+)\.html(?:#([^"]+))?"/;
  for (const item of html.matchAll(itemPattern)) {
    const href = hrefPattern.exec(item[1]);
    if (!href) continue;
    const page = `${href[1]}.html`;
    const anchor = href[2] ? safeDecode(href[2]) : "class-description";
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

async function ensureStored(
  version: string,
  force = false,
): Promise<StoredMeta> {
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

// Keyed by version and entry count: the entry count changes whenever the
// inventory itself is refreshed, which is the only time this needs to redo
// the 30,000-entry scan instead of returning what it already built.
const memoryMeta = new Map<string, MetaIndex>();

export async function ensureMeta(
  entries: DocEntry[],
  version: string,
  force = false,
): Promise<MetaIndex> {
  const stored = await ensureStored(version, force);
  const cacheKey = `${version}:${stored.fetchedAt}:${entries.length}`;
  if (!force) {
    const remembered = memoryMeta.get(cacheKey);
    if (remembered) return remembered;
  }

  const deprecated = new Set(stored.deprecated);

  const meta: MetaIndex = {};
  for (const entry of entries) {
    const isDeprecated = deprecated.has(`${entry.page}|${entry.anchor}`);
    const isLegacyScheduler = entry.pkg === "org.bukkit.scheduler";
    if (isDeprecated || isLegacyScheduler)
      meta[entry.name] = {
        deprecated: isDeprecated,
        legacyScheduler: isLegacyScheduler,
      };
  }

  memoryMeta.set(cacheKey, meta);
  return meta;
}
