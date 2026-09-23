# did-it-finish

A GitHub Action that checks whether a pull request is actually done, not just green.

Coding agents are good at making a pull request look finished. The checks pass because a test
was deleted, an assertion was loosened, a test was marked `.skip`, or a function body is
`raise NotImplementedError`. The description still has three unchecked boxes. Humans do this
too, just less often. `did-it-finish` reads the diff and posts one sticky comment with a verdict:

> ## did-it-finish: Not done
>
> This pull request has signs of unfinished work.
>
> | Check | Count | Blocks "done" |
> |---|---|---|
> | Stubs added | 1 | yes |
> | Assertions removed | 1 | no |
> | New TODO or FIXME | 2 | no |
>
> ### Stubs added
> - `src/invoice.ts:2` stub: `throw new Error("Not implemented");`

See a real run on [a demo pull request](https://github.com/rk-chavali/did-it-finish/pull/1).

## What it checks

Everything is computed from the pull request's base...head diff, as returned by the GitHub API.

| Finding | Blocks "done" | What counts |
|---|---|---|
| `tests-failed` | yes | The optional `test-command` exited non-zero or timed out. |
| `tests-deleted` | yes | A test file was removed. |
| `stubs-added` | yes | New `raise NotImplementedError`, `throw new Error("not implemented")`, `NotImplementedException`, `UnsupportedOperationException("not implemented")`, `todo!()` / `unimplemented!()`, `panic("not implemented")`, and new Python functions whose body is only `pass` or `...` (abstract methods and `@overload`s excepted). Only non-test files. |
| `unchecked-tasks` | yes | `- [ ]` items in the PR description. Items inside HTML comments (templates) are ignored. |
| `assertions-removed` | no | A test file's diff removes more assertions than it adds. Counts `expect(`, `assert`, `assert*(`, `self.assert*`, `Assert.*(`, `t.Fatal`/`t.Error`, `require.*`/`assert.*` (Go testify), `assert_eq!`, `.should`, `pytest.raises`, and `verify(`. |
| `tests-skipped` | no | New `.skip(`, `.todo(`, `xit`/`xdescribe`, `@pytest.mark.skip`/`skipif`, `@unittest.skip*`, `pytest.skip(`, `@Disabled`, `@Ignore`, `t.Skip`, `[Fact(Skip = ...)]`, `#[ignore]`, and RSpec `skip`, in test files. |
| `todos-added` | no | New lines containing `TODO` or `FIXME` as whole words, in any file. |

The verdict:

- **Not done** when any blocking finding is present.
- **Probably done** when only non-blocking findings are present.
- **Done** when there are no findings at all.

A test file is one under `test/`, `tests/`, `__tests__/`, or `spec/`, or named like `*.test.ts`,
`*.spec.js`, `test_*.py`, `*_test.py`, `*_test.go`, `*_spec.rb`, `*Test.java`, `*Tests.cs`,
or `conftest.py`.

## Usage

```yaml
# .github/workflows/did-it-finish.yml
name: did-it-finish

on:
  pull_request:
    types: [opened, synchronize, reopened, edited, ready_for_review]

permissions:
  contents: read
  pull-requests: write # to post the sticky comment

jobs:
  did-it-finish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with:
          node-version: 24
      - run: npm ci
      - uses: rk-chavali/did-it-finish@v1
        with:
          test-command: npm test
          fail-on: tests-failed, tests-deleted, stubs-added, unchecked-tasks
```

Include `edited` in the trigger types so the check re-runs when someone ticks a checkbox in
the description. The same file is in [`examples/did-it-finish.yml`](examples/did-it-finish.yml).

### Inputs

| Input | Default | Description |
|---|---|---|
| `github-token` | `${{ github.token }}` | Reads the pull request and posts the comment. |
| `test-command` | (none) | Shell command that runs your tests. It runs in `$GITHUB_WORKSPACE`, so check out the code and install dependencies first. |
| `fail-on` | `tests-failed` | Finding types that fail the job, separated by commas or spaces. Use `any` or `none` as shorthands. |
| `test-timeout-minutes` | `30` | The whole process tree of the test command is killed after this long. |
| `test-output-lines` | `40` | Lines of test output shown in the comment. Set 0 to leave output out. |
| `comment` | `true` | Post or update the sticky comment. The result always goes to the job summary. |

### Outputs

`verdict` (`Done`, `Probably done`, `Not done`), `finding-count`, and `findings`: a JSON
array of `{type, message, file, line}` you can use in later steps.

### The sticky comment

The action posts one comment per pull request and edits it on every run. It finds that comment
by a hidden `<!-- did-it-finish -->` marker, and only among comments written by a bot, so
nobody can hijack it by pasting the marker. Each finding links to the exact line at the head
commit.

## Security

- **Use `pull_request`, not `pull_request_target`, when you set `test-command`.**
  `pull_request_target` runs with write access and secrets, and `test-command` executes the
  pull request's code. On pull requests from forks, `pull_request` gets a read-only token.
  The action then can't comment, logs a warning, and still writes the result to the job
  summary.
- Test output is posted publicly in the comment. The output is filtered first: common
  credential shapes (`Authorization:` headers, `token=`/`password=` values, GitHub, OpenAI, and
  AWS key formats, passwords in URLs) are redacted, and ANSI codes are stripped. Filtering is
  best effort. Set `test-output-lines: 0` if your tests can print secrets.

## Limitations

- These are heuristics over the diff, not a proof. A test can be weakened without removing an
  assertion, and a stub can be written in a way no pattern matches. The goal is to catch the
  common shortcuts cheaply, before a human reviews.
- GitHub omits the patch for binary files and very large diffs. Those files are skipped, and
  the log says how many. The files API returns at most 3000 files per pull request.
- A renamed test file is not reported as deleted.

## Development

```bash
npm ci
npm run all   # lint, typecheck, tests, build dist/
```

`dist/` is committed, because Actions run it directly, and CI fails if it is stale.

## License

MIT
