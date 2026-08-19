---
name: webapp-testing
description: Test a web app like a user — drive the built-in browser through real flows, check console/network/DOM at each step, and report what actually works. Use after building or changing a web app, or when asked to test/verify one.
---

# Web-app testing

Test the app the way a user meets it, not the way the code is organized.

## Order of operations

1. **Start the server yourself** (or confirm it's running): check the port
   is free before binding, `execute` the dev command, then confirm the page
   that loads is YOUR app, not a stale server on the same port.
2. **Smoke pass with `verify_page`** on the entry HTML where applicable:
   loads, no console errors, body height sane, canvas actually drawing.
3. **Walk the critical flows with the browser tools** — 3-6 flows max,
   chosen by user value (sign-in, create/edit, search, submit, navigation).
   For each step: act (click/type), then READ (DOM/accessibility tree) and
   assert the expected change actually happened. Never chain 5 actions
   blind and assert once at the end.
4. **Error paths on the most important form**: empty submit, wrong format,
   double-click the submit button. The app should show a message, not
   silently do nothing and not crash.
5. **Console + network after every flow**: any uncaught error or failed
   request during a passing flow is still a finding.
6. **Responsive spot-check** if layout matters: one narrow-viewport pass
   over the main page.

## Reporting

Report per-flow: PASS/FAIL, what you did, what you observed (quote the DOM
or console line — no "seems fine"). FAILs come with the exact repro step
and, if you can see it, the offending source location. Fix-worthy findings
that are out of scope get listed at the end, not silently fixed.

Never report a flow you did not actually drive. "The code looks right" is
not a test result.
