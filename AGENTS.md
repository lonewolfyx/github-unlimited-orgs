# Repository Contribution Rules

## Branch and Pull Request Policy

- Never commit changes directly to the `main` branch.
- All commits must be made on a dedicated, non-`main` branch.
- Whenever changes are committed to a branch, create a corresponding pull request from that branch.
- Pull request titles and descriptions must be written in English.

## AI TypeScript Rules

- AI must not proactively recommend TypeScript type definitions unless the user explicitly asks for them.
- AI must not write or introduce the TypeScript types `unknown`, `any`, `undefined`, or `null`.

## Conventional Commits for Pull Requests

- When creating a pull request, follow the [Conventional Commits](https://www.conventionalcommits.org/) specification in full.
- Every commit message included in the pull request and the pull request title must use the Conventional Commits format: `<type>[optional scope]: <description>`.
- Mark breaking changes with `!` after the type or scope and document them with a `BREAKING CHANGE:` footer when applicable.
