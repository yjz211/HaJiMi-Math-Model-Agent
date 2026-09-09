import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

const eslintConfig = [
  {
    ignores: [
      ".claude/worktrees/**",
      ".next/**",
      "electron/dist/**",
      "release/**",
      "out/**",
      "coverage/**",
      "bundled/**/resources/assets/tools/**",
      "compatibility/v010/bundled/**/resources/assets/tools/**",
      "compatibility/v010/toolkit/legacy-modeling-plot-suite/**",
      "toolkit/legacy-modeling-plot-suite/**",
    ],
  },
  ...coreWebVitals,
  ...typescript,
  {
    // Preserve original workflow source; validate it with the compatibility tests.
    files: ["compatibility/v010/lib/hajimi/figure-plan.ts", "compatibility/v010/lib/hajimi/stage8-phases.ts", "lib/hajimi/stage8-phases.ts"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
  {
    rules: {
      "react-hooks/immutability": "off",
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
];

export default eslintConfig;
