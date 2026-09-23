# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-09-23

### Added

- GitHub Action that runs on `pull_request` and reads the base...head diff through the API.
- Findings: tests deleted, assertions removed, tests newly skipped, new TODO or FIXME, stub
  bodies added, and unchecked task-list items in the PR description.
- Optional `test-command` with a timeout that kills the whole process tree, and a redacted
  output tail.
- Verdict of Done, Probably done, or Not done in a single sticky PR comment and the job summary.
- `fail-on` input to choose which findings fail the job, and `verdict`, `finding-count`, and
  `findings` outputs.
