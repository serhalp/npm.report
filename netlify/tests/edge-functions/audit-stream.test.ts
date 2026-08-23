// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  createJobIfAbsent:
    vi.fn<typeof import("../../functions/_shared/audit-jobs.ts").createJobIfAbsent>(),
  finishJob: vi.fn<typeof import("../../functions/_shared/audit-jobs.ts").finishJob>(),
  getJob: vi.fn<typeof import("../../functions/_shared/audit-jobs.ts").getJob>(),
  runAudit: vi.fn<typeof import("../../../src/lib/runAudit.ts").runAudit>(),
  saveReportSnapshot:
    vi.fn<typeof import("../../functions/_shared/report-persistence.ts").saveReportSnapshot>(),
  updateJobLog: vi.fn<typeof import("../../functions/_shared/audit-jobs.ts").updateJobLog>(),
}));

vi.mock("../../functions/_shared/audit-jobs.ts", () => ({
  createJobIfAbsent: mocked.createJobIfAbsent,
  finishJob: mocked.finishJob,
  getJob: mocked.getJob,
  updateJobLog: mocked.updateJobLog,
}));
vi.mock("../../functions/_shared/report-persistence.ts", () => ({
  saveReportSnapshot: mocked.saveReportSnapshot,
}));
vi.mock("../../../src/lib/runAudit.ts", () => ({ runAudit: mocked.runAudit }));

import handler, { config } from "../../edge-functions/audit-stream.ts";

const RESULT = { failures: [] };
const VALID_REQUEST = {
  jobId: "job-1",
  from: -1,
  orgs: ["vue"],
  kinds: ["trust"],
  months: 12,
  all: true,
  bots: ["GitHub Actions"],
  members: [],
};

interface Frame {
  event: string;
  id?: number;
  data: unknown;
}

function post(body: unknown): Request {
  return new Request("https://audit.example/api/audit-stream", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function readFrames(response: Response): Promise<Frame[]> {
  const text = await response.text();
  return text
    .trim()
    .split("\n\n")
    .filter(Boolean)
    .map((raw) => {
      const lines = raw.split("\n");
      const event = lines
        .find((line) => line.startsWith("event:"))
        ?.slice(6)
        .trim();
      const data = lines
        .find((line) => line.startsWith("data:"))
        ?.slice(5)
        .trim();
      const id = lines
        .find((line) => line.startsWith("id:"))
        ?.slice(3)
        .trim();
      if (!event || !data) throw new Error(`Invalid SSE frame: ${raw}`);
      const frame: Frame = { event, data: JSON.parse(data) };
      if (id !== undefined) frame.id = Number(id);
      return frame;
    });
}

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocked.createJobIfAbsent.mockResolvedValue(true);
  mocked.finishJob.mockResolvedValue(undefined);
  mocked.runAudit.mockResolvedValue(RESULT);
  mocked.saveReportSnapshot.mockResolvedValue({ id: "vue-2026-08-09-abc12345" });
  mocked.updateJobLog.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("audit stream edge function", () => {
  it("rejects malformed JSON", async () => {
    const response = await handler(
      new Request("https://audit.example/api/audit-stream", { method: "POST", body: "{" }),
    );

    expect(response.status).toBe(400);
    await expect(response.text()).resolves.toBe("invalid JSON");
  });

  it.each([
    ["an invalid job id", { ...VALID_REQUEST, jobId: "not valid" }, "invalid audit request"],
    [
      "too many orgs",
      { ...VALID_REQUEST, orgs: ["a", "b", "c", "d", "e", "f"] },
      "invalid audit request",
    ],
    ["no orgs", { ...VALID_REQUEST, orgs: [] }, "no orgs supplied"],
    ["a blocked org", { ...VALID_REQUEST, orgs: [" Types "] }, "DefinitelyTyped"],
    ["no reports", { ...VALID_REQUEST, kinds: [] }, "no reports selected"],
    [
      "an external report without members",
      { ...VALID_REQUEST, kinds: ["external"] },
      "the external report needs an org member list",
    ],
  ])("rejects %s", async (_name, body, message) => {
    const response = await handler(post(body));

    expect(response.status).toBe(400);
    expect(await response.text()).toContain(message);
    expect(mocked.createJobIfAbsent).not.toHaveBeenCalled();
  });

  it("runs and persists a fresh audit while streaming its terminal result", async () => {
    mocked.runAudit.mockImplementation(async (_config, _kinds, _members, log) => {
      log("[trust] checking manifests");
      return RESULT;
    });

    const response = await handler(post(VALID_REQUEST));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/event-stream; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await readFrames(response)).toEqual([
      { event: "log", id: 0, data: "[trust] checking manifests" },
      { event: "result", data: RESULT },
      {
        event: "done",
        data: { id: "vue-2026-08-09-abc12345", url: "/report/vue-2026-08-09-abc12345" },
      },
    ]);
    expect(mocked.createJobIfAbsent).toHaveBeenCalledWith("job-1", {
      orgs: ["vue"],
      kinds: ["trust"],
      months: 12,
      all: true,
      bots: ["GitHub Actions"],
    });
    expect(mocked.runAudit).toHaveBeenCalledWith(
      expect.objectContaining({ orgs: ["vue"], jobs: 12 }),
      ["trust"],
      [],
      expect.any(Function),
    );
    expect(mocked.saveReportSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ orgs: ["vue"], scope: "all", payload: RESULT }),
    );
    expect(mocked.finishJob).toHaveBeenCalledWith(
      "job-1",
      expect.objectContaining({
        status: "done",
        log: [{ seq: 0, line: "[trust] checking manifests" }],
        result: RESULT,
        reportId: "vue-2026-08-09-abc12345",
        error: null,
      }),
    );
  });

  it("uses external members without persisting them in the resumable job", async () => {
    const members = ["sensitive-owner", "private-developer"];
    mocked.runAudit.mockResolvedValueOnce({
      external: { rows: [], distinctUsers: 0, byUser: [] },
      failures: [],
    });

    const response = await handler(post({ ...VALID_REQUEST, kinds: ["external"], members }));
    await readFrames(response);

    expect(mocked.runAudit).toHaveBeenCalledWith(
      expect.objectContaining({ orgs: ["vue"] }),
      ["external"],
      members,
      expect.any(Function),
    );
    expect(mocked.createJobIfAbsent).toHaveBeenCalledWith("job-1", {
      orgs: ["vue"],
      kinds: ["external"],
      months: 12,
      all: true,
      bots: ["GitHub Actions"],
    });
    expect(mocked.saveReportSnapshot.mock.calls.at(-1)?.[0].payload).not.toHaveProperty("members");
  });

  it("streams the result and records a non-terminal report save failure", async () => {
    mocked.saveReportSnapshot.mockRejectedValueOnce(new Error("database unavailable"));

    const response = await handler(post(VALID_REQUEST));

    expect(await readFrames(response)).toEqual([
      { event: "result", data: RESULT },
      { event: "done", data: { error: "database unavailable" } },
    ]);
    expect(mocked.finishJob).toHaveBeenCalledWith(
      "job-1",
      expect.objectContaining({
        status: "done",
        result: RESULT,
        reportId: null,
        error: "database unavailable",
      }),
    );
  });

  it("records and streams an audit failure", async () => {
    mocked.runAudit.mockRejectedValueOnce(new Error("manifest unavailable"));

    const response = await handler(post(VALID_REQUEST));

    expect(await readFrames(response)).toEqual([{ event: "error", data: "manifest unavailable" }]);
    expect(mocked.finishJob).toHaveBeenCalledWith("job-1", {
      status: "error",
      log: [],
      error: "manifest unavailable",
    });
    expect(mocked.saveReportSnapshot).not.toHaveBeenCalled();
  });

  it("periodically persists progress while a fresh audit is still running", async () => {
    vi.useFakeTimers();
    const audit = Promise.withResolvers<typeof RESULT>();
    mocked.runAudit.mockImplementation(async (_config, _kinds, _members, log) => {
      log("still working");
      return audit.promise;
    });

    const response = await handler(post(VALID_REQUEST));
    await vi.advanceTimersByTimeAsync(1000);

    expect(mocked.updateJobLog).toHaveBeenCalledWith("job-1", [{ seq: 0, line: "still working" }]);

    audit.resolve(RESULT);
    await expect(readFrames(response)).resolves.toContainEqual({
      event: "done",
      data: { id: "vue-2026-08-09-abc12345", url: "/report/vue-2026-08-09-abc12345" },
    });
  });

  it("streams a job initialization failure", async () => {
    mocked.createJobIfAbsent.mockRejectedValueOnce(new Error("database unavailable"));

    const response = await handler(post(VALID_REQUEST));

    expect(await readFrames(response)).toEqual([{ event: "error", data: "database unavailable" }]);
    expect(mocked.runAudit).not.toHaveBeenCalled();
  });

  it("resumes a completed job without rerunning the audit", async () => {
    mocked.createJobIfAbsent.mockResolvedValueOnce(false);
    mocked.getJob.mockResolvedValueOnce({
      status: "done",
      log: [
        { seq: 0, line: "already seen" },
        { seq: 1, line: "new line" },
      ],
      result: RESULT,
      reportId: "vue-resumed",
      error: null,
    });

    const response = await handler(post({ ...VALID_REQUEST, from: 0 }));

    expect(await readFrames(response)).toEqual([
      { event: "log", id: 1, data: "new line" },
      { event: "result", data: RESULT },
      { event: "done", data: { id: "vue-resumed", url: "/report/vue-resumed" } },
    ]);
    expect(mocked.runAudit).not.toHaveBeenCalled();
    expect(mocked.saveReportSnapshot).not.toHaveBeenCalled();
    expect(mocked.finishJob).not.toHaveBeenCalled();
  });

  it("terminates an expired resume instead of polling forever", async () => {
    mocked.createJobIfAbsent.mockResolvedValueOnce(false);
    mocked.getJob.mockResolvedValueOnce(null);

    const response = await handler(post(VALID_REQUEST));

    expect(await readFrames(response)).toEqual([{ event: "error", data: "audit session expired" }]);
    expect(mocked.getJob).toHaveBeenCalledOnce();
  });

  it("forwards a resumed job's terminal audit error", async () => {
    mocked.createJobIfAbsent.mockResolvedValueOnce(false);
    mocked.getJob.mockResolvedValueOnce({
      status: "error",
      log: [],
      result: null,
      reportId: null,
      error: "manifest unavailable",
    });

    const response = await handler(post(VALID_REQUEST));

    expect(await readFrames(response)).toEqual([{ event: "error", data: "manifest unavailable" }]);
    expect(mocked.runAudit).not.toHaveBeenCalled();
  });

  it("retains the report-creation rate limit", () => {
    expect(config).toEqual({
      path: "/api/audit-stream",
      method: "POST",
      rateLimit: { windowLimit: 30, windowSize: 60, aggregateBy: ["ip"] },
    });
  });
});
