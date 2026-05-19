Continue the current task without re-asking for confirmation or clarification.

This is the slash-command form of the global rule: a bare "do" / "do it" / "yes" means *continue, keep going, proceed*. Resume from where you left off.

How to handle `/do`:

1. **Find what's in-flight.** Re-read the most recent assistant turn and any TaskList entries marked `in_progress`. If the prior turn ended with an offer ("want me to X?") or a paused step, that's the thing to resume.
2. **Don't restart.** Do not re-survey the codebase, re-explain the plan, or re-ask the user what they want. They already said *do it*.
3. **No preamble.** Skip "Sure, here we go" — just run the next concrete action (Edit, Bash, TaskUpdate, etc.).
4. **If you genuinely don't know what to resume** (no prior assistant message, no in-progress tasks, fresh session), say so in one sentence and ask what to do. Don't fabricate an interpretation.
5. **Respect risk gates.** "Continue" does not authorize new destructive actions that weren't already proposed and accepted. Stay within the scope of the work that was paused.

Treat `/do` as a no-op accelerator: it removes a turn of friction, not a turn of judgment.
