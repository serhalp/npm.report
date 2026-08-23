import { render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import TagInput from "./TagInput.svelte";

describe("TagInput", () => {
  test("forwards validation relationships to the text input", () => {
    render(TagInput, {
      props: {
        values: [],
        onChange: vi.fn<(values: string[]) => void>(),
        ariaInvalid: true,
        ariaDescribedby: "org-help org-error",
      },
    });

    expect(screen.getByRole("textbox")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("textbox")).toHaveAttribute("aria-describedby", "org-help org-error");
  });

  test("commits comma and enter separated values with dedupe", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn<(values: string[]) => void>();
    render(TagInput, {
      props: {
        values: ["netlify"],
        onChange,
        placeholder: "Add org",
      },
    });

    await user.type(screen.getByRole("textbox"), "netlify,gatsbyjs{Enter}");

    expect(onChange).toHaveBeenCalledWith(["netlify", "gatsbyjs"]);
    expect(screen.getByRole("status")).toHaveTextContent("Added gatsbyjs.");
  });

  test("commits on blur and lowercases when requested", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn<(values: string[]) => void>();
    render(TagInput, {
      props: {
        values: [],
        onChange,
        placeholder: "Add org",
        lowercase: true,
      },
    });

    await user.type(screen.getByPlaceholderText("Add org"), "Netlify");
    await user.tab();

    expect(onChange).toHaveBeenCalledWith(["netlify"]);
  });

  test("removes chips by button and with empty backspace", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn<(values: string[]) => void>();
    render(TagInput, {
      props: {
        values: ["alpha", "beta"],
        onChange,
      },
    });

    await user.click(screen.getByRole("button", { name: "Remove alpha" }));
    expect(onChange).toHaveBeenCalledWith(["beta"]);
    expect(screen.getByRole("status")).toHaveTextContent("Removed alpha.");

    await user.click(screen.getByRole("textbox"));
    await user.keyboard("{Backspace}");
    expect(onChange).toHaveBeenCalledWith(["alpha"]);
  });
});
