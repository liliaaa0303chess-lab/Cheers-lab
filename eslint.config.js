import firebaseRulesPlugin from '@firebase/eslint-plugin-security-rules';

export default [
  {
    ignores: ['dist/**/*', 'node_modules/**/*', 'src/**/*', '*.ts', '*.mjs'],
  },
  firebaseRulesPlugin.configs['flat/recommended'],
];
