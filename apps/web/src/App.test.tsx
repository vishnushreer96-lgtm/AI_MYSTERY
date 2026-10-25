import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { App } from "./App.js";

describe("case creation", () => {
  it("shows fictional scenario form and difficulty options", () => {
    render(<App />);
    expect(screen.getByLabelText("THE SCENARIO")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /CREATE MYSTERY/i }),
    ).toBeTruthy();
    expect(screen.getByLabelText("DIFFICULTY")).toBeTruthy();
  });
});
