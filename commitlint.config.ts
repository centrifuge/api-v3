export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    // Level [0..2]: 0=disable, 1=warning, 2=error
    // Applicable: 'always' or 'never'
    // Value: [Array of allowed types]
    "type-enum": [
      2,
      "always",
      [
        "build",
        "chore",
        "ci",
        "docs",
        "feat",
        "fix",
        "perf",
        "refactor",
        "revert",
        "style",
        "test",
        "deprecation", // <-- ADD THIS
      ],
    ],
  },
};
