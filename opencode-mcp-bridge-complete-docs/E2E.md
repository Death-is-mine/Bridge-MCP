# End-to-End Scenarios

## Scenario 1

User opens web GUI.
→ Bridge connected.
→ OpenCode connected.
→ Select repository.
→ Send command.
→ OpenCode executes.
→ UI streams result.

## Scenario 2

AI client calls opencode.session.send.
→ Bridge authenticates.
→ OpenCode receives prompt.
→ events stream back.
→ execution completes.

## Scenario 3

Workflow attempts git push.
→ Bridge pauses.
→ approval request displayed.
→ user approves.
→ push executes.
→ audit record written.
