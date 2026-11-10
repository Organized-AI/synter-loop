---
description: Run every verification check before a commit
---

Run `just verify` (guards, typecheck, tests, bundle; plugin checks from Phase 1) and report:

```
VERIFICATION
Guards:     PASS / FAIL
Typecheck:  PASS / FAIL
Tests:      PASS / FAIL (<n> passed)
Bundle:     PASS / FAIL
Hermes:     PASS / FAIL / n/a
Overall:    READY TO COMMIT / NEEDS FIXES
```

On failure, list each error and stop. Do not commit.
