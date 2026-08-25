# Execution Engine

The Bridge coordinates intent; OpenCode executes coding work.

## Flow

```text
request
→ validate
→ resolve repository
→ resolve session
→ authorize
→ OpenCode call
→ stream events
→ persist execution result
```

The engine must be resumable and observable.

Do not duplicate OpenCode's own agent logic in the Bridge.
