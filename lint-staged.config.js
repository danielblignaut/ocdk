module.exports = {
	'**/*.+(json|yml|yaml|graphql|gql)': [
		'npx prettier ', 
		'git add'
	],
	'**/*.+(ts|js|tsx|jsx)': [
		'npx eslint --config .eslintrc.js ', 
		'git add'
	],
}
