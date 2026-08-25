# Web GUI

## Goal

A basic web interface that is extremely easy to use.

## Main screen

### Header
- Bridge status
- OpenCode status
- repository
- connected AI clients

### Command panel
Large text area and Send button.

### Session panel
- current session
- state
- elapsed time
- stop button

### Output panel
Live execution events and assistant output.

### Diff panel
Current git diff with changed files.

### Approval panel
Sensitive operations waiting for confirmation.

## UX states

Every major view must support:
- loading
- connected
- disconnected
- empty
- error
- waiting for approval

## Design rule

Do not turn the dashboard into a complicated IDE.
The primary job is:

"Tell OpenCode what to do, see what it is doing, and review what changed."
