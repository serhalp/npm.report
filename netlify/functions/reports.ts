import type { Config } from "@netlify/functions";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { reports } from "../../db/schema.js";

// Turn org names into a URL-safe slug fragment, e.g. ["Netlify","Gatsby"] -> "netlify-gatsby".
function slugifyOrgs(orgs: string[]): string {
  const joined = (orgs.length ? orgs : ["npm"])
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return joined || "npm";
}

// Build the human-readable primary key: <orgs>-<yyyy-mm-dd>-<shorthash>.
// The short hash is content-derived (sha256 of the payload), so re-sharing an
// identical report yields the same id (idempotent) and ids never collide by
// accident.
function buildId(orgs: string[], payload: unknown): string {
  const hash = createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 8);
  const date = new Date().toISOString().slice(0, 10);
  return `${slugifyOrgs(orgs)}-${date}-${hash}`;
}

export default async (req: Request) => {
  const url = new URL(req.url);
  // /api/reports/:id  ->  ["", "api", "reports", ":id"]
  const parts = url.pathname.split("/").filter(Boolean);
  const id = parts[2];

  if (req.method === "GET") {
    if (!id) return new Response("Not found", { status: 404 });
    const [row] = await db.select().from(reports).where(eq(reports.id, id));
    if (!row) return new Response("Not found", { status: 404 });
    return Response.json(row);
  }

  if (req.method === "POST") {
    let body: { orgs?: string[]; scopeLabel?: string; payload?: unknown };
    try {
      body = await req.json();
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }
    if (!body || typeof body !== "object" || body.payload == null) {
      return new Response("Missing payload", { status: 400 });
    }
    const orgs = Array.isArray(body.orgs) ? body.orgs.map(String) : [];
    const newId = buildId(orgs, body.payload);
    await db
      .insert(reports)
      .values({
        id: newId,
        orgs: orgs.join(", "),
        scopeLabel: typeof body.scopeLabel === "string" ? body.scopeLabel : "",
        payload: body.payload,
      })
      // Same content + same day = same id; treat a re-share as a no-op.
      .onConflictDoNothing();
    return Response.json({ id: newId }, { status: 201 });
  }

  return new Response("Method not allowed", { status: 405 });
};

export const config: Config = {
  path: ["/api/reports", "/api/reports/:id"],
};
