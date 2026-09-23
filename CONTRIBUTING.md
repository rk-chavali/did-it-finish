# Contributing

## Setup

Use Node.js 24.

```bash
npm ci
```

## Checks

Run these before opening a pull request. CI runs the same commands.

```bash
npm run lint
npm run typecheck
npm test
npm run build   # regenerates dist/, which is committed
```

New or changed detection needs a fixture diff in `tests/fixtures/` and a test in
`tests/findings.test.ts` that fails without the change. Commit the rebuilt `dist/` in the same
pull request.

## Commit style

Use [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `docs:`,
`test:`, `ci:`, `chore:`. Keep each commit to one logical change.
