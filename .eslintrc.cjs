module.exports = {
  extends: "ponder",
  parserOptions: {
    tsconfigRootDir: process.cwd(),
  },
  plugins: ["unused-imports", "jsdoc"],
  rules: {
    "@typescript-eslint/no-unused-vars": [
      "error",
      {
        vars: "all",
        args: "after-used",
        ignoreRestSiblings: false,
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
      },
    ],
    "unused-imports/no-unused-imports": "error",
    "jsdoc/require-jsdoc": [
      "warn",
      {
        require: {
          ClassDeclaration: true,
          MethodDefinition: true,
        },
      },
    ],
  },
};
