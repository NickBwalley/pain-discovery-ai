import { expect, it } from "vitest";
import {
  categorySelection,
  projectCategories,
  researchCategories,
  researchProject,
} from "../lib/research";

it("turns chosen categories into a valid private HN project without user-entered details", () => {
  const project = researchProject(["cybersecurity", "founders"]);
  expect(project.title).toBe("Cyber security + Startup founders");
  expect(project.keywords).toContain("vulnerability");
  expect(project.keywords).toContain("founder");
  expect(project.enabled_sources).toEqual(["hacker_news"]);
  expect(project.scheduled).toBe(false);
  expect(projectCategories(project.keywords)).toEqual([
    "cybersecurity",
    "founders",
  ]);
});
it("validates selections and keeps every five-category preset inside the keyword cap", () => {
  expect(categorySelection.safeParse([]).success).toBe(false);
  expect(categorySelection.safeParse(["arbitrary domain"]).success).toBe(false);
  expect(
    categorySelection.safeParse(researchCategories.slice(0, 6).map((c) => c.id))
      .success,
  ).toBe(false);
  for (let start = 0; start < researchCategories.length; start++) {
    const ids = Array.from(
      { length: 5 },
      (_, offset) =>
        researchCategories[(start + offset) % researchCategories.length].id,
    );
    expect(researchProject(ids).keywords.length).toBeLessThanOrEqual(20);
  }
  expect(researchProject(["b2b", "b2b"]).title).toBe("B2B & SaaS");
});
it("supports alternatives as a category without asking for a competitor field", () => {
  const project = researchProject(["alternatives"]);
  expect(project.keywords).toContain("alternative");
  expect(project.competitors).toEqual([]);
});
