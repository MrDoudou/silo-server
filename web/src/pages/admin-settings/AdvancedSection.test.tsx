import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { AdvancedSection } from "./AdvancedSection";

describe("AdvancedSection", () => {
  it("keeps tuning fields in the document while the section is closed", () => {
    render(
      <AdvancedSection>
        <p>Scanner Workers</p>
      </AdvancedSection>,
    );

    const details = screen.getByText("Scanner Workers").closest("details");
    expect(details).not.toBeNull();
    expect(details).not.toHaveAttribute("open");
    expect(screen.getByText("Advanced")).toBeInTheDocument();
    expect(
      screen.getByText(/These keep their defaults unless you change them/),
    ).toBeInTheDocument();
  });

  it("expands on click so the nested fields become visible", async () => {
    const user = userEvent.setup();
    render(
      <AdvancedSection>
        <p>Matcher Batch Size</p>
      </AdvancedSection>,
    );

    await user.click(screen.getByText("Advanced"));

    expect(screen.getByText("Matcher Batch Size").closest("details")).toHaveAttribute("open");
  });
});
