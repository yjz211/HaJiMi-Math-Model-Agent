# 0.12 runtime dependency repair

## Implemented
- Offline runtime extended from the original archive with the installed adjustText 1.4.0 package and its dist-info/license files (10 files). No unrelated host packages copied.
- New version: 1.0.0-local-test.20260909-adjusttext. New Ed25519 local-test key; private material is outside both product and build output. Release/trust metadata and offline archive are present in both root and compatibility/v010 runtime directories.
- Future runtime builder explicitly pins adjustText==1.4.0.
- Both runtime environment implementations redirect pip's default install target to cache/python-packages/<runtime digest>, and add this directory to the controlled Python path. Signed runtime bytes are not the install destination. Existing no-bytecode setting retained.
- The external redraw helper now passes PYTHONDONTWRITEBYTECODE=1 to subprocesses.
- Packaging preflight validates the included archive when no download URL is configured.

## Similar risks found
- SciencePlots was subsequently removed at the user's request: import, automatic installation, style application and related guidance were removed from all four active source/resource copies. Existing palettes remain unchanged. Authorized resource hashes are recorded in v012-scienceplots-removal.json.
- Linux font fallback uses apt-get; it is not a Windows solution and macOS/Linux deployment requires separate verification.
- Calling the bundled Python directly outside the managed environment can still write caches or dependencies. Use the managed runner; the environment settings are not an OS sandbox.
- Explicit pip --target/--prefix options or arbitrary code can override defaults; this change prevents the built-in helpers' default install behavior from modifying the signed runtime, not intentional writes.
- A failed optional install may fall back silently in the original helper. Dependency availability should remain part of release validation.
- Installed environments may remain pinned inside existing sessions; new runtime activation must precede resuming those sessions.

## Scope
The runtime repair did not change drawing prompts, palettes, recipes or plotting algorithms. The subsequent authorized SciencePlots removal changes only that dependency's helper branches and related guidance; palettes remain unchanged. This is a Windows offline runtime update, not a completed application installer or macOS release. The existing runtime's local-test designation is retained; this is not a commercial code-signing certificate or a new redistribution certification.

## Checks
Nine runtime-process tests pass, including cache/extra-package environment routing and native process behavior. Offline archive hash/signature packaging preflight passes. Live runtime installation succeeded. An offline probe package installed into the external cache, adjustText imported from the signed payload and rendered successfully, and full post-execution runtime integrity verification passed. SciencePlots removal smoke rendering, capability integrity and authorized legacy snapshot checks pass. Three existing modeling workspaces were synchronized and each verified against 275 injected files.
