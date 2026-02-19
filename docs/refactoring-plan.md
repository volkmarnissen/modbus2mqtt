# Refactoring Plan

This document outlines the planned refactorings, their proposed order to minimize risk and effort, and a coarse TODO checklist per item. The guiding principle is to keep the test suite green after each step.

## Principles

- Keep tests passing after each change; ship in small increments.
- Maintain backward compatibility temporarily where feasible; add deprecation paths.
- Prefer automated transformations and CI checks to reduce manual errors.

## Proposed Order (Low-risk → Higher-impact)

1. SPEC packaging (immediate): Extract `src/specification` into a delivery npm package with minimal dependencies; adapt CI.-> Done
2. Bus TCP bridge change (immediate): Replace enable-flag with explicit port; keep backward compatibility. -> Done
3. Replace Alpine build: Use direct Dockerfile build and publish; introduce a new npm package if required by delivery flow.
4. Directory structure split: Separate `backend`, `frontend`, and `packaging/delivery (root)` clearly.-> Done
5. Angular 21 migration: Upgrade dependencies and tooling first to enable modern template features.-> Done
6. Modern control flow in templates: Replace `*ngIf`/`*ngFor` with `@if`/`@for` across the app.-> Done
7. Promises → async/await: Convert promise chains to `async/await` with ESLint rules.
8. Split large classes: Decompose `config`, `httpserver`, etc., into cohesive modules.
9. File uploads as base64 in specification: Store images/documents embedded in the specification model.
10. More backend tests: Expand coverage continuously, prioritizing changed areas (ongoing alongside steps above).

Rationale highlights:

- (1) and (2) are isolated and unlock later work; add compatibility to keep tests green.
- (3) affects delivery pipeline with minimal runtime code impact.
- (4) reorganizes layout; doing it before large code changes avoids repeated conflicts.
- (5) enables (6); upgrading first prevents double work.
- (7) is mostly mechanical and safer after the project compiles against latest toolchain.
- (8) and (9) are higher-impact runtime changes; schedule after foundations are stable.

---

## 1) SPEC packaging (immediate)

Goal: Build and publish `src/specification` as a standalone npm package with fewer dependencies than `specification + server`.

TODO:

- Identify public API surface needed by server/frontend.
- Extract minimal package content from `src/specification/`.
- Create package metadata: `package.json`, `README`, `LICENSE`, `exports`, `types`.
- Configure build: `tsconfig`, output `dist`, sourcemaps, declaration files.
- Slim dependencies: move heavy deps to peer/optional if possible.
- Wire CI (copy from lxc-manager workflows): build, test, version, publish (private/public per policy).
- Update imports in server/frontend to consume the new package.
- Run full tests; ensure no circular deps or path issues.

## 2) Bus TCP bridge uses port (immediate)

Goal: Replace boolean "enable tcp bridge" with explicit `tcpBridgePort`.

TODO:

- Update config schema and validators: add `tcpBridgePort: number`; deprecate old flag.
- Backward compatibility: if old flag true and no port set → use default (documented) or warn.
- Update `Bus` implementation to bind based on port presence.
- Adjust CLI/env mapping (if any) and runtime logs.
- Update unit/integration tests to cover new + legacy paths.
- Update docs and examples.

## 3) Replace Alpine build with Dockerfile + npm package

Goal: Build with a direct Dockerfile; replace Alpine-specific pipeline; add a new npm package if delivery requires it.

TODO:

- Create/modernize `docker/Dockerfile` (multi-stage: build → runtime).
- Remove/retire Alpine packaging scripts; keep a migration note.
- Update CI workflow to build and push image (tags: commit, branch, semver).
- If needed, introduce a delivery npm package and publish it from CI.
- Update documentation and local dev scripts.

## 4) Directory structure split

Goal: Clear separation of concerns: `backend`, `frontend`, `packaging/delivery (root)`.

TODO:

- Propose target layout and agree: e.g.,
  - `backend/` (server code, tests)
  - `frontend/` (Angular app, tests)
  - `packaging/` (Docker, release, scripts)
  - Root: monorepo config (eslint, prettier, tsconfig base)
- Move files incrementally; update TS path mappings and tooling configs.
- Fix scripts in `package.json` and CI paths.
- Verify builds and tests at each stage.

## 5) Migrate to Angular 21

Goal: Upgrade Angular stack to v21.

TODO:

- Run `ng update` to 21 with compatibility checks.
- Update builder configs, tsconfig, ESLint, rxjs if required.
- Fix breaking changes and recompile.
- Verify unit/E2E tests.

## 6) Use `@for` and `@if` templates

Goal: Replace `*ngFor` and `*ngIf` with modern control flow.

TODO:

- Enable/verify Angular 17+ features (already covered by v21).
- Plan batch-wise conversion per module to keep diffs small.
- Provide codemod or consistent manual pattern.
- Run lint rules to discourage legacy syntax.
- Retest affected components.

## 7) Promises → async/await

Goal: Standardize on `async/await` for readability and error handling.

TODO:

- Enable ESLint rules (e.g., no-misused-promises, promise/prefer-await-to-then).
- Convert core async flows; keep public API signatures stable.
- Ensure proper error propagation and try/catch where needed.
- Retest.

## 8) Split large classes (config, httpserver, etc.)

Goal: Improve maintainability by decomposing large classes into modules.

TODO:

- Identify hot spots (size, responsibilities, churn).
- Extract cohesive services (e.g., routing, file handling, auth, config IO).
- Maintain public API; add thin facades if needed.
- Add targeted tests around extracted modules.

## 9) File uploads as base64 in specification

Goal: Store uploaded images/documents embedded as base64 in the specification.

TODO:

- Define schema changes and migration path (IDs, mime type, size limits, dedup).
- Update HTTP endpoints to write/read embedded assets.
- Update client upload/display to use embedded content.
- Write migration script for existing filesystem assets.
- Add tests for upload, retrieval, deletion, persistence.

## 10) More backend tests (ongoing)

Goal: Increase coverage for changed areas and critical paths.

TODO:

- Coverage gap analysis (lines/branches on server/specification modules).
- Add tests for: spec packaging boundaries, Bus port behavior, base64 asset handling, config/httpserver splits.
- Integrate coverage threshold in CI (ratchet up gradually).

---

## Immediate Next Steps (today)

- Kick off SPEC packaging (scaffold package, CI workflow draft, first build locally).
- Implement Bus TCP bridge port change with backward compatibility and tests.
- Open PRs with small, reviewable commits; ensure CI stays green.
