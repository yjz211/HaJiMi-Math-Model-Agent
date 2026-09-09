# 0.12 runtime binding repair

Canonical source: this HaJiMi-v0.1.2 directory. No installer was built.

Strict policy and stage 8 now bind project plotting assets to this product's compatibility/v010 tree before agent startup and file/shell tool execution. Existing managed helper files are refreshed byte for byte. Recorded stale capability paths and literal paths in current figure generators are redirected; project runtime metadata is updated to the current project and product locations. Historical outputs are not regenerated or relabeled.

Original vendored plotting prompts, recipes and rendering algorithms were not edited. Original mathematical modeling calculations and user figure plans were not edited. Both policy modes retain their existing stage routing and stage-eight rollback behavior.

Verification:
- Runtime binding / routing regression tests pass, including relocated product and stale helper restoration.
- TypeScript check and changed TypeScript lint pass.
- Frozen 0.10 plotting inventory and hash test passes.
- Preservation audit passes (431 original resources, 419 lean resources).
- Windows subset: 177 pass, 2 skipped, zero failures.
- Full suite initially: 740 pass, 8 skipped, 4 fail. The obsolete legacy snapshot test was corrected to compare the frozen 0.10 inventory and rerun successfully. The remaining three failures require a WSL distribution absent from this machine (WSL_E_DISTRO_NOT_FOUND); WSL execution is not certified by this run.
- Three existing modeling workspaces repaired: 275 injected files per project verified byte-exact. Current Python figure generators contain no reference to the old installation directory.
- Development backend restarted; HTTP homepage returned 200.

Existing PNG/PDF images remain historical outputs; resource replacement does not retroactively change their rendering or planning. Packaging has not been executed or smoke-tested in this repair.

For an explicit existing workspace repair, run from this source root:
node scripts/repair-v012-plot-workspace.mjs "absolute-project-directory"
