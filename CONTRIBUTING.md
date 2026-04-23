# Contributing to pm-AMM

Thank you for your interest in contributing to pm-AMM! This document will help you get started.

## Prerequisites

- [Rust](https://rustup.rs/) (stable)
- [Solana CLI](https://docs.solanalabs.com/cli/install) (v3+)
- [Anchor CLI](https://www.anchor-lang.com/docs/installation) (v1.0+)
- [Node.js](https://nodejs.org/) (v20+)
- [pnpm](https://pnpm.io/) (v9+)
- Python 3.10+ (for oracle tests only)

## Setup

```bash
git clone https://github.com/<owner>/pm-amm.git
cd pm-amm
pnpm install
cd app && pnpm install
```

Copy the environment template:

```bash
cp .env.example app/.env.local
```

## Development Workflow

1. Create a branch from `main`:
   - `feat/description` for new features
   - `fix/description` for bug fixes
   - `docs/description` for documentation
   - `refactor/description` for refactoring

2. Make your changes following the code standards below.

3. Run all relevant tests (see below).

4. Open a Pull Request against `main`.

## Running Tests

```bash
# Rust unit tests (49 tests — math, accrual, state)
cd anchor && cargo test --package pm_amm

# TypeScript integration tests (18 tests — requires local validator)
cd anchor && anchor test

# Python oracle tests (130 tests — scipy cross-validation)
cd oracle && python3 -m pytest test_oracle.py test_properties.py -v

# Frontend type-check + build
cd app && pnpm tsc --noEmit && pnpm build

# Lint
cd app && pnpm lint
```

## Code Standards

- **Max 70 lines per function.** Break complex logic into helpers.
- **Strict TypeScript.** Minimize `as any` — document with eslint-disable when unavoidable.
- **Paper fidelity.** All math formulas must match the [Paradigm pm-AMM paper](https://www.paradigm.xyz/2024/11/pm-amm) exactly. If you simplify, flag with `// SIMPLIFIED: <reason>`.
- **Compute budget.** 400k CU on all mutative Anchor instructions.
- **No debug artifacts.** Remove all `console.log` / `debugger` before committing.

## Architecture

See [README.md](README.md) for the full architecture overview and [doc/wp-para.md](doc/wp-para.md) for the paper reference.

## Pull Requests

- CI must pass (Rust tests, Clippy, type-check, build, lint).
- Include a clear description of what changed and why.
- Math changes must be cross-checked with the Paradigm paper.
- One reviewer required.

## Questions?

Open an issue to discuss before starting large changes.
