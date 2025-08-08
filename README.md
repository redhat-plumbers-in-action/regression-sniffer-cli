# Regression Sniffer CLI

[![npm version][npm-status]][npm] [![Tests][test-status]][test] [![Linters][lint-status]][lint] [![CodeQL][codeql-status]][codeql] [![codecov][codecov-status]][codecov]

[npm]: https://www.npmjs.com/package/regression-sniffer
[npm-status]: https://img.shields.io/npm/v/regression-sniffer

[test]: https://github.com/redhat-plumbers-in-action/regression-sniffer-cli/actions/workflows/tests.yml
[test-status]: https://github.com/redhat-plumbers-in-action/regression-sniffer-cli/actions/workflows/tests.yml/badge.svg

[lint]: https://github.com/redhat-plumbers-in-action/regression-sniffer-cli/actions/workflows/lint.yml
[lint-status]: https://github.com/redhat-plumbers-in-action/regression-sniffer-cli/actions/workflows/lint.yml/badge.svg

[codeql]: https://github.com/redhat-plumbers-in-action/regression-sniffer-cli/actions/workflows/codeql-analysis.yml
[codeql-status]: https://github.com/redhat-plumbers-in-action/regression-sniffer-cli/actions/workflows/codeql-analysis.yml/badge.svg

[codecov]: https://codecov.io/gh/redhat-plumbers-in-action/regression-sniffer-cli
[codecov-status]: https://codecov.io/gh/redhat-plumbers-in-action/regression-sniffer-cli/graph/badge.svg?token=79yXVIeHyn

<!-- -->

## Description

Simple CLI tool that checks upstream projects for follow-ups in downstream source code. It works in tandem with GitHub Action [@redhat-plumbers-in-action/regression-sniffer](https://github.com/redhat-plumbers-in-action/regression-sniffer). Detected follow-ups are reported in Jira as issues for further triage.

## Configuration

Make sure to store your JIRA Personal Access Token (PAT) and GitHub Personal Access Token (PAT) in the `~/.config/regression-sniffer/.env` or `~/.env.regression-sniffer` file:

```bash
# ~/.config/regression-sniffer/.env
JIRA_API_TOKEN="example-token"
GITHUB_API_TOKEN="example-token"
```

> [!TIP]
>
> You can also set default values for the `component`, `upstream`, `downstream` and more in the `~/.config/regression-sniffer/.env` or `~/.env.regression-sniffer` file:
>
> ```bash
> # ~/.config/regression-sniffer/.env
> COMPONENT="your-component"
> UPSTREAM="your-upstream-org/your-upstream-repo"
> DOWNSTREAM="your-downstream-org/your-downstream-repo"
> RELEASE="your-release-version"
> EPIC="your-epic-key"
> LABEL="your-label"
> CLEANUP="true"
> NOCOLOR="true"
> DRY="true"
> ```

## Installation

```bash
# run it using npx
npx regression-sniffer

# or install it globally using npm
npm install -g regression-sniffer
regression-sniffer --help
```

## How to use

> [!IMPORTANT]
>
> This tool is intended to be used by Red Hat employees on the Red Hat JIRA instance. It was designed to be used on systemd component in first place, but it can be updated to work with other components.

```md
$ regression-sniffer --help
Usage: regression-sniffer [options]

🔍 A CLI tool that searches for follow-up and revert commits in upstream projects and creates Jira issues to track them.

Options:
  -V, --version                  output the version number
  -c, --component <component>    component name
  -r, --release <release>        RHEL major release version, e.g. 8, 9, 10, etc.
  -e, --epic <epic>              Jira epic name
  -d, --downstream <downstream>  GitHub downstream source-git org/repo
  -f, --from <from>              upstream version(tag) from which to start searching for backported commits
  -u, --upstream <upstream>      GitHub upstream org/repo
  -L, --label <label>            Jira issue label that indicates issues reported by this tool
  -w, --cleanup                  cleanup cloned repositories (default: false)
  -n, --nocolor                  disable color output (default: false)
  -x, --dry                      dry run
  -h, --help                     display help for command
```
