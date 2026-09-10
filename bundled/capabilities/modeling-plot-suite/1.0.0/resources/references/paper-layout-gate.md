# Paper Layout Gate — Mathematical Modeling

Apply this gate to every figure intended for the competition paper. A source figure that looks good alone is not accepted until it is readable and balanced at its final physical size on the compiled page.

## 1. Plan the page role before drawing

Record `single`, `single-landscape`, or an evidence-driven multi-panel layout and the destination section in the manifest. Generate figures near their final physical width instead of shrinking an oversized canvas later.

Use one semantic claim per figure by default. Combine panels only when they must be compared together to support that claim. Do not force unrelated results into one composite figure. Draw.io/TikZ engineering, physical, roadmap, network, scheduling, and geometric diagrams are single figures and must not be paired side by side.

## 2. Shape the source for the page

- Prefer horizontal stages, lanes, or compact grids for deterministic diagrams; target roughly 4:3–16:9.
- Avoid tall single-chain flowcharts and excessive prose inside nodes.
- For engineering and physical diagrams, preserve the real mechanism, dimensions, directions, forces, rays, coordinates, and constraints while simplifying decoration.
- Remove unused margins before changing inclusion width.
- Build necessary multi-panel data figures in Matplotlib as one vector PDF. Do not shrink several independent PDFs into LaTeX subfigures.
- Use vector PDF as the deterministic master. Raster content must retain sufficient effective resolution.

## 3. Normalize LaTeX inclusion size

After all figure blocks exist in `figures/latex_includes.tex`, run the aspect-ratio normalizer injected by bootstrap:

```text
python _utils/fig_include_size.py --figdir figures --latex figures/latex_includes.tex
```

Its baseline uses actual PDF aspect ratio: landscape `0.85\textwidth`, near-square `0.70\textwidth`, portrait `0.50\textwidth`, tall `0.42\textwidth`, with `keepaspectratio` and a loose height cap. This prevents tall diagrams from filling a page, but it is only the first placement pass.

## 4. Audit effective text after scaling

Run the injected final-size auditor. Supply the paper template's real dimensions rather than assuming them.

```text
python _utils/audit_final_figure_size.py figures/*.pdf --tex-root figures/latex_includes.tex --profile modeling --textwidth-mm <actual> --columnwidth-mm <actual> --linewidth-mm <actual> --textheight-mm <actual> --json figures/final_size_audit.json
```

For the modeling profile, 8.5 pt is a readability reference, not a hard minimum. Smaller text is acceptable when clear at final size; review its role, contrast, and surrounding space rather than enlarging every label to meet a number. Default small-font findings are non-blocking REVIEW notes. Do not sacrifice template proportions or information just to reach the reference size. `NOT_AUDITABLE` is not a pass: rasterized text, outlined text, and image-only illustrations require final-size visual inspection.

## 5. Preserve the approved size in the paper

Copy complete figure blocks from `figures/latex_includes.tex`; change caption or label only. Do not rewrite `width` or `height`. When the paper source exists, run:

```text
python _utils/fig_size_consistency_check.py --latex figures/latex_includes.tex --paperdir paper
```

Any mismatch is a blocking failure. Restore the approved include size and fix readability in the source figure.

## 6. Compile and inspect the actual page

Compile enough times to resolve references, render every page containing a figure, and inspect at normal reading scale. Check:

- no figure is an unreadable small island or an unjustified near-full-page object;
- labels, Chinese text, formulas, legends, arrows, forces, rays, dimensions, and node relationships remain clear;
- no clipping, overlap, excessive blank region, broken page, or float pile-up occurs;
- each figure follows its introducing text and is followed by interpretation;
- only evidence that must be read together remains in a multi-panel figure;
- the overall set is visually coherent without making every figure structurally identical.

## Failure treatment

- Too small or unreadable: simplify, split unrelated panels, increase source fonts, reduce empty canvas, or regenerate near final size.
- Too large: redesign tall chains horizontally, reduce internal whitespace, or split overloaded content before reducing inclusion width.
- A dense engineering/physical diagram must be simplified or split; it must not be replaced by a generic flowchart.
- Never use arbitrary LaTeX scaling or tiny height caps merely to meet a page limit.

Record the inclusion coefficient, effective-font verdict, consistency verdict, and compiled-page verdict for every manifest item. Completion requires all four records.

