export type EntryKind =
  | "class"
  | "interface"
  | "enum"
  | "annotation"
  | "exception"
  | "record"
  | "event"
  | "method"
  | "field"
  | "constant"
  | "initializer"
  | "package"
  | "guide";

export type SectionId =
  | "scheduler"
  | "events"
  | "entities"
  | "inventory"
  | "core"
  | "paper"
  | "utils"
  | "guide";

export interface DocEntry {
  name: string;
  display: string;
  pkg: string;
  owner: string;
  kind: EntryKind;
  section: SectionId;
  page: string;
  anchor: string;
  url: string;
  // Only set on Javadoc entries; guide entries come from a single, unversioned site.
  version?: string;
}

export interface EntryMeta {
  deprecated?: boolean;
  legacyScheduler?: boolean;
}

export type MetaIndex = Record<string, EntryMeta>;

export interface Inventory {
  version: string;
  fetchedAt: number;
  entries: DocEntry[];
}

export const SECTIONS: { id: SectionId | "all"; title: string }[] = [
  { id: "all", title: "All" },
  { id: "scheduler", title: "Region Scheduler" },
  { id: "events", title: "Events" },
  { id: "entities", title: "Entities" },
  { id: "inventory", title: "Inventory" },
  { id: "core", title: "Core API" },
  { id: "paper", title: "Paper API" },
  { id: "utils", title: "Utilities" },
  { id: "guide", title: "Guides" },
];

export const KIND_LABELS: Record<EntryKind, string> = {
  class: "Class",
  interface: "Interface",
  enum: "Enum",
  annotation: "Annotation",
  exception: "Exception",
  record: "Record",
  event: "Event",
  method: "Method",
  field: "Field",
  constant: "Constant",
  initializer: "Constructor",
  package: "Package",
  guide: "Guide",
};

export function isType(kind: EntryKind): boolean {
  return (
    kind === "class" ||
    kind === "interface" ||
    kind === "enum" ||
    kind === "annotation" ||
    kind === "exception" ||
    kind === "record" ||
    kind === "event"
  );
}
