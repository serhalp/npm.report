import { describe, expect, it } from "vitest";
import { getTrustLevelName, getTrustStatus } from "./trust";

describe("trust status", () => {
  it("matches packumeta trust precedence", () => {
    expect(
      getTrustLevelName({
        provenance: true,
        trustedPublisher: true,
        stagedPublish: true,
      }),
    ).toBe("stagedPublish");

    expect(
      getTrustLevelName({
        provenance: true,
        trustedPublisher: true,
        stagedPublish: false,
      }),
    ).toBe("trustedPublisher");

    expect(
      getTrustLevelName({
        provenance: true,
        trustedPublisher: false,
        stagedPublish: false,
      }),
    ).toBe("provenance");

    expect(
      getTrustLevelName({
        provenance: false,
        trustedPublisher: true,
        stagedPublish: false,
      }),
    ).toBe("none");
  });

  it("uses packumeta trust status and adds publisher fallback", () => {
    expect(
      getTrustStatus({
        _npmUser: {
          name: "GitHub Actions",
          trustedPublisher: "",
          approver: false,
        },
        dist: {
          attestations: {
            provenance: {},
          },
        },
      }),
    ).toEqual({
      provenance: true,
      trustedPublisher: false,
      stagedPublish: false,
      level: "provenance",
      order: 1,
      publisher: "GitHub Actions",
    });

    expect(
      getTrustStatus({
        _npmUser: {
          trustedPublisher: true,
          approver: null,
        },
        dist: {
          attestations: {
            provenance: false,
          },
        },
      }),
    ).toMatchObject({
      provenance: false,
      trustedPublisher: true,
      stagedPublish: false,
      level: "none",
      order: 0,
      publisher: "?",
    });
  });
});
