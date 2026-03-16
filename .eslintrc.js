module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    project: ['./tsconfig.base.json', './apps/*/tsconfig.json', './apps/*/tsconfig.test.json', './packages/*/tsconfig.json', './packages/*/tsconfig.test.json'],
    tsconfigRootDir: __dirname,
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
  ],
  rules: {
    // Prohibit 'any' — use 'unknown' and narrow with type guards
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-unsafe-assignment': 'error',
    '@typescript-eslint/no-unsafe-call': 'error',
    '@typescript-eslint/no-unsafe-member-access': 'error',
    '@typescript-eslint/no-unsafe-return': 'error',
    // Require explicit return types
    '@typescript-eslint/explicit-function-return-type': ['error', { allowExpressions: true }],
    '@typescript-eslint/explicit-module-boundary-types': 'error',
    // No console.log in production code — use NestJS Logger
    'no-console': 'error',
    // No TODO comments in committed code
    'no-warning-comments': ['error', { terms: ['TODO', 'FIXME', 'HACK'], location: 'start' }],
    // Prefer const
    'prefer-const': 'error',
    // No unused variables
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
  },
  overrides: [
    {
      // Allow 'any' in test mocks only and relax unbound-method for vi.mocked() patterns
      files: ['**/*.spec.ts', '**/*.test.ts'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-unsafe-assignment': 'off',
        '@typescript-eslint/no-unsafe-call': 'off',
        '@typescript-eslint/no-unsafe-member-access': 'off',
        'no-console': 'off',
        // vi.mocked(service.method) patterns reference unbound methods by design
        '@typescript-eslint/unbound-method': 'off',
      },
    },
    {
      // Next.js pages/components have different patterns
      files: ['apps/web/**/*.tsx', 'apps/web/**/*.ts'],
      rules: {
        '@typescript-eslint/explicit-module-boundary-types': 'off',
      },
    },
  ],
  ignorePatterns: ['dist/', 'node_modules/', '.next/', 'coverage/', '*.js'],
};
