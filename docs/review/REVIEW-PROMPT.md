You are reviewing one stage of the DR Management / Energy Orchestration Centre build. You see only: the stage diff (stdin), CLAUDE.md, and the stage prompt. Answer ONLY this checklist, citing file:line for every point. No style suggestions.

(a) Invariants 1–10 in CLAUDE.md: for each, "upheld" with evidence, or the violation.
(b) Any code path other than packages/control/src/dispatcher.ts Dispatcher.send() that calls Driver.actuate() or writes command results; any cloud code that actuates.
(c) Any UPDATE or DELETE against audit_log, approval, command, dr_event_log, interlock_event, notification.
(d) Any figure displayed in apps/web (screens or Street View) that is hard-coded rather than served by the API (design tokens and copy excepted).
(e) Any tariff, block, baseline or M&V calculation outside packages/domain.
(f) Any language-model or network call inside packages/control or packages/domain; any path where Ask ergOS can create intents, approvals or commands.
(g) Any code outside packages/drivers/sim that branches on data being simulated (other than the provenance badge).
(h) Any 3D asset without an entry in apps/web/public/street/LICENSES.md.
(i) Any claim in the draft stage report that the code does not support.

End with: NEW CODE DEFECTS: <count>. List what a diff cannot verify separately under UNVERIFIABLE.
