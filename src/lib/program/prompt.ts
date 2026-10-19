/**
 * The prompt users paste into Claude or ChatGPT along with their program.
 * It asks for JSON in exactly our v1 schema with standard exercise names,
 * which is what keeps import and silent exercise matching reliable.
 */
export const PROGRAM_PROMPT = `Convert the workout program below into JSON using Spotter's format (schemaVersion 1). Use standard exercise names. Reply with the JSON only, in a single \`\`\`json code block.

Format:
{
  "schemaVersion": 1,
  "name": "Program name",
  "author": "Claude",
  "weeks": 8,
  "progressionNotes": "How to progress, e.g. Add 2.5 kg when all sets hit the top of the rep range.",
  "days": [
    {
      "id": "upper-a",
      "name": "Upper A",
      "dayOfWeek": "Mon",
      "items": [
        {
          "type": "strength",
          "name": "Barbell Bench Press",
          "equipment": "barbell",
          "sets": 4,
          "reps": "6-8",
          "restSeconds": 150,
          "supersetGroup": null,
          "notes": "Pause first rep"
        },
        {
          "type": "cardio",
          "name": "Incline Treadmill Walk",
          "durationMinutes": 20,
          "notes": "Incline 10-12, speed 5-5.5 km/h"
        }
      ]
    }
  ]
}

Rules:
- Exercise names: use the full, standard name with the equipment first, e.g. "Dumbbell Romanian Deadlift", "Cable Lateral Raise", "Barbell Back Squat". No abbreviations (not "DB RDL" or "OHP"). Use the same name every time an exercise appears.
- "type" is "strength" or "cardio".
- "equipment" (strength only) is one of: barbell, dumbbell, machine, cable, kettlebell, bodyweight, other.
- "sets" is a whole number of working sets. Leave out warm-up sets.
- "reps" is a number (8) or a range string ("8-10"). For timed holds like planks, put the seconds in "reps" and write "seconds" in "notes".
- "restSeconds" is the rest after each set, in seconds.
- "supersetGroup": exercises done as a superset share the same letter ("A", "B"), and sit next to each other in the list. Otherwise null.
- "dayOfWeek" is Mon, Tue, Wed, Thu, Fri, Sat or Sun. If the program is a rotation with no fixed days, use null.
- "id" is a short lowercase id for the day, e.g. "upper-a".
- Weights and notes use kg. Put cues, tempo and intensity guidance in "notes".
- Cardio uses "durationMinutes" and "notes" only.

Here's my program:
`;

/** The first line, shown as a short preview on the import screen. */
export const PROGRAM_PROMPT_PREVIEW = PROGRAM_PROMPT.split("\n")[0];
