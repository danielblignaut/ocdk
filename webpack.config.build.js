const path = require('path')
const fs = require('fs')

// const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin')
module.exports = (dirname)=> {
	
	const SOURCE_DIR = path.join(dirname, './src/')
	const TARGET_DIR = path.join(dirname, './dist/')


	const filename = 'index.js'
	const entry = path.join(SOURCE_DIR, 'index.ts')

	let plugins = []


	return {
		mode: 'production',
		devtool: 'source-map',
		entry,
		target: 'node',
		resolve: {
			extensions: ['.mjs', '.ts', '.js']
		},
		output: {
			libraryTarget: 'commonjs2',
			path: TARGET_DIR,
			filename: filename
		},
		//   externals: [],
		module: {
			rules: [
				{
					test: /.tsx?$/,
					use: [
						{ 
							loader: 'ts-loader',
							options: {
								configFile: path.join(dirname, 'tsconfig.build.json')
							}
						}
					],
				}
			]
		},
		plugins,
		externals: [
			{ 'aws-sdk': 'commonjs aws-sdk' },
		],
		optimization: {
			minimize: true,
		},
	}

}