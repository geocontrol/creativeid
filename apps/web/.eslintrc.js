/** @type {import("eslint").Linter.Config} */
module.exports = {
  root: true,
  extends: ['@creativeid/eslint-config/next'],
  parserOptions: {
    project: true,
    tsconfigRootDir: __dirname,
  },
};
