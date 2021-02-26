const path = require('path')

module.exports = {
	'ignorePatterns': [
		'**/node_modules/**',
		'**/cdk.out/**',
		'**/dist/**',
		'**/__generated__/**'
	],
	'env': {
		'es6': true,
		'node': true,
		'jest': true,
		'browser': false
	},
	'extends': ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
	'globals': {
		'Atomics': 'readonly',
		'SharedArrayBuffer': 'readonly',
		'window': true
	
	},
	'parserOptions': {
		'ecmaVersion': 2018,
		'sourceType': 'module'
	},
	'rules': {
		'@typescript-eslint/ban-ts-comment': ['warn'],
		'@typescript-eslint/ban-types': ['warn'],
		'no-console': ['warn'],
		'@typescript-eslint/explicit-function-return-type': ['off'],
		'@typescript-eslint/no-empty-interface': ['warn'],
		'@typescript-eslint/indent': [1, 'tab'],
		'@typescript-eslint/no-var-requires': ['off'],
		'@typescript-eslint/member-delimiter-style': [
			'error',
			{
				'multiline': {
					'delimiter': 'none'
				},
				'singleline': {
					'delimiter': 'semi'
				}
			}
		],
		'@typescript-eslint/type-annotation-spacing': [
			'error',
			{
				'after': true,
				'before': false
			}
		],
		'linebreak-style': ['error', 'unix'],
		'quotes': ['error', 'single'],
		'semi': ['error', 'never']
	},
	'parser': '@typescript-eslint/parser',
	'plugins': [ '@typescript-eslint'],
	'overrides': [
   
	]
}
