import { describe, expect, it } from "vitest";
import { parseMembers } from "./members";

describe("parseMembers", () => {
  it("extracts users from multiple npm org JSON objects", () => {
    expect(
      parseMembers(`
        {"Alice": "owner", "bob": "developer"}
        noisy text between objects
        {"BOB": "owner", "carol": "developer"}
      `),
    ).toEqual(["alice", "bob", "carol"]);
  });

  it("does not break brace matching on strings or escaped quotes", () => {
    expect(
      parseMembers(String.raw`
        {"alice": "owner {not structural}", "b\"ob": "developer"}
      `),
    ).toEqual(["alice", 'b"ob']);
  });

  it("falls back to a commented newline-separated list", () => {
    expect(
      parseMembers(`
        # copied from a members file
        Alice
        bob
        alice
      `),
    ).toEqual(["alice", "bob"]);
  });
});
