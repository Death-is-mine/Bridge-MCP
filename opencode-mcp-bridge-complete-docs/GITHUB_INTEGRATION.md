# GitHub Integration

GitHub is optional and must remain outside the OpenCode core adapter.

## Safe workflow

1. inspect status
2. inspect diff
3. run tests
4. create commit only with permission
5. push only with permission
6. open/fetch PR
7. fetch review feedback
8. send feedback back to OpenCode
9. run tests again

Never auto-push or merge by default.
