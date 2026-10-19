import { describe, expect, it } from "vitest";
import { matchExercise, type MatchCandidate } from "../match";

const lib: MatchCandidate[] = [
  { id: "rdl", name: "Dumbbell Romanian Deadlift", equipment: "dumbbell", aliases: [] },
  { id: "bench", name: "Barbell Bench Press", equipment: "barbell", aliases: ["flat bench"] },
  { id: "pullup", name: "Pull-Up", equipment: "bodyweight", aliases: [] },
  { id: "lat", name: "Lat Pulldown", equipment: "cable", aliases: [] },
  { id: "lateral", name: "Dumbbell Lateral Raise", equipment: "dumbbell", aliases: [] },
];

describe("matchExercise", () => {
  it("matches exact names case-insensitively", () => {
    expect(matchExercise("barbell bench press ", "barbell", lib)).toEqual({ id: "bench", kind: "exact" });
  });
  it("matches stored aliases", () => {
    expect(matchExercise("Flat Bench", "barbell", lib)).toEqual({ id: "bench", kind: "alias" });
  });
  it.each([
    ["DB RDL", "rdl"],
    ["Romanian Deadlift (Dumbbell)", "rdl"],
    ["Dumbbell Romainian Deadlifts", "rdl"],
    ["Pull Ups", "pullup"],
    ["pullup", "pullup"],
    ["Lat Pull-Down", "lat"],
    ["Dumbbell Lateral Raises", "lateral"],
  ])("fuzzy: %s", (name, id) => {
    expect(matchExercise(name, null, lib)).toEqual({ id, kind: "fuzzy" });
  });
  it.each([
    ["Dumbbell Bench Press"],
    ["Incline Barbell Bench Press"],
    ["Romanian Deadlift"],
    ["Barbell Romanian Deadlift"],
    ["Chin-Up"],
    ["Cable Lateral Raise"],
  ])("does not merge different exercises: %s", (name) => {
    expect(matchExercise(name, null, lib)).toBeNull();
  });
  it("respects conflicting equipment on fuzzy matches", () => {
    expect(matchExercise("Lat Pull Down", "machine", lib)).toBeNull();
    expect(matchExercise("Lat Pull Down", "cable", lib)).toEqual({ id: "lat", kind: "fuzzy" });
  });
});
