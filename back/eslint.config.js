// back/eslint.config.js
// Análisis de calidad del código del backend (lo corre el pipeline de CI).
import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules/**', 'src/facturacion/xsd/**'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
    },
  },
];
