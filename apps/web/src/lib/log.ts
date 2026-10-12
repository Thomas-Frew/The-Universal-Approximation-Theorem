import type { Observation } from "@uat/shared";

/**
 * Something the player learned after the free samples: by asking the machine
 * (`query`, costs a query) or from a failed submission (`revealed`, free).
 */
export type LogEntry = Observation & { source: "query" | "revealed" };
