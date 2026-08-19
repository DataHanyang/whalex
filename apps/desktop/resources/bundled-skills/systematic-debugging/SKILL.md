---
name: systematic-debugging
description: A disciplined debugging loop for when something is broken and the cause isn't obvious — reproduce first, localize with evidence, one change at a time. Use for bugs, failing tests, crashes, or "it worked yesterday" situations.
---

# Systematic debugging

Debugging fails when it becomes guess-and-pray. Hold this loop instead:

1. **Reproduce before anything else.** Find the smallest reliable trigger —
   exact command, exact input, exact environment. If you cannot reproduce
   it, that IS the current task; don't "fix" what you can't see fail.
2. **Read the actual error, all of it.** Bottom-most cause in the stack,
   not the top-most symptom. Copy the key line into your notes; don't work
   from memory of it.
3. **Localize with evidence, not intuition.**
   - What changed last? (`git log -p` on the touched area, recent installs)
   - Bisect the space: disable half, retest, repeat — code paths, config,
     data, whichever axis is cheapest to halve.
   - Add targeted logging/prints at the boundary you suspect; log VALUES,
     not "got here".
4. **State a hypothesis before changing anything** — one sentence: "X
   produces Y because Z." If you can't say it, you're not ready to edit.
5. **One change per experiment.** Make the single edit the hypothesis
   demands, rerun the reproduction, and record confirmed/refuted. Refuted →
   revert it and return to step 3. Never stack speculative fixes.
6. **Fix the cause, then prove it.** Reproduction passes, the surrounding
   test suite still passes, and — where a test SHOULD have caught this —
   add that test so the bug can't return silently.
7. **Clean up.** Remove the debug logging you added; summarize root cause →
   fix → proof in one short paragraph for the user.

Hard rules: don't silence the symptom (swallowing exceptions, widening
types, sleep()s) and call it fixed; don't declare victory without rerunning
the original reproduction; after ~3 refuted hypotheses, step back and
re-read the whole failing path top to bottom instead of poking further.
