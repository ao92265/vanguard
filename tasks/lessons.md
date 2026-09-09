# Lessons

- **[2026-08-25] React effect keyed on an array prop's identity looped forever**: the
  worktree fetch in `useQuickOpenItems` depended on `tabs`; setting state re-rendered, the
  caller rebuilt the array, and the effect refired — the vitest suite died with
  "JavaScript heap out of memory" while single files passed. → **Fix**: depend on a derived
  content signature (a joined string of the fields that matter) and read the live array
  through a ref. Hidden in the app because Zustand returns a stable reference, so a
  passing app is not evidence here — only a caller that rebuilds the array exposes it.
- **[2026-08-25] Single test files passing hid a suite-wide OOM**: each new test file
  passed alone; only the full run failed. → **Fix**: when a suite OOMs, run the untouched
  baseline (another worktree on main) to prove whether you caused it, then bisect per file
  with a deliberately small `--max-old-space-size` to surface a runaway loop fast.
- **[2026-08-25] `biome-ignore` split across two lines is silently ignored**: biome
  reported both the suppression as unused *and* the original rule as violated. → **Fix**:
  keep the whole `biome-ignore <rule>: <reason>` on one line, however long.
- **[2026-09-08] Inspector state survived switching the selected item**: a rename
  draft remained mounted for another session. → **Fix**: key the detail action subtree
  by stable item identity and test switching while editing, including focus return.
- **[2026-09-08] A synthetic PNG probe was too short for real validation**: the
  production service correctly rejected it. → **Fix**: use an existing real image
  asset when validating byte-preserving delivery, not a signature-only sample.
- **[2026-09-09] A camelCased Tailwind token generates no rule and fails silently**:
  `text-maestro-onAccent` looked like a class but the token is `on-accent`, so
  Tailwind emitted nothing and accent-filled buttons inherited body text, failing
  contrast in both themes with no error anywhere. → **Fix**: assert the generated
  CSS, not the class string, and walk every surface rather than one sample. A guard
  that checks one of three sites will pass while two are broken.
- **[2026-09-09] Test directories are excluded from tsconfig, so a fixture can lie
  about its own type**: a ledger fixture omitted a required field while typed as
  having it, which defeated the exact fix it was written to guard, and tsc stayed
  green. → **Fix**: when a test's job is to guard a field, build the fixture through
  the real builder or assert the field is present. Ask of every new test whether the
  value it asserts is one the real system can actually produce.
- **[2026-09-09] Nullish, not `=== null`, when absence has two spellings**: the
  builder only ever wrote null, so a `=== null` check looked total, but entries made
  any other way held undefined and were counted as real projects. → **Fix**: compare
  with `== null` whenever a value reaches the code from more than one construction
  path.
- **[2026-09-09] Passing a derived value as a prop makes a test silently vacuous**: a
  new test set `isMultiRepo={true}`, but the component derives that from
  `workspaceType` and `repositories` and never reads a prop by that name. JSX spread
  relaxes the excess-property check, so tsc stayed green, and the test passed against
  the unfixed code. → **Fix**: mutate the fix away and confirm the test goes red
  before believing it. On this branch that one step caught what tsc, biome and 1568
  other passing tests did not.
- **[2026-09-09] A dead branch keeps its props alive**: removing the unreachable
  toolbar layout dropped seven prop passes that looked live at the call site. They
  were all reachable elsewhere, but only reading each consumer proved it. → **Fix**:
  before deleting a branch, grep each prop it consumed for a second consumer. A
  green typecheck proves the code compiles, not that the feature is still reachable.
