import { render, screen } from "@testing-library/svelte";
import { describe, expect, test } from "vitest";
import TrustGlossary from "./TrustGlossary.svelte";

describe("TrustGlossary", () => {
  test("uses the report palette for each trust level", () => {
    render(TrustGlossary);

    expect(screen.getByText("Staged publishing")).toHaveClass("glossary__term--staged");
    expect(screen.getByText("Trusted publisher")).toHaveClass("glossary__term--trusted");
    expect(screen.getByText("Provenance")).toHaveClass("glossary__term--provenance");
    expect(screen.getByText("None")).toHaveClass("glossary__term--none");
    expect(screen.getByText(/prepared and reviewed before it goes live/)).toBeInTheDocument();
    expect(screen.getByText(/release rests on the maintainer's account/)).toBeInTheDocument();
  });
});
