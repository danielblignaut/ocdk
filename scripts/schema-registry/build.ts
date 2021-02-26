import { compileFromFile } from '@ocdk/json-schema-2-dynamo-easy'
import fs from 'fs'
import path from 'path'
import fse from 'fs-extra'

function flatten(array: any[], mutable = false): any[] {
	const toString = Object.prototype.toString
	const arrayTypeStr = '[object Array]'

	const result = []
	const nodes = (mutable && array) || array.slice()
	let node

	if (!array.length) {
		return result
	}

	node = nodes.pop()

	do {
		if (toString.call(node) === arrayTypeStr) {
			//eslint-disable-next-line
			nodes.push.apply(nodes, node)
		} else {
			result.push(node)
		}
	} while (nodes.length && (node = nodes.pop()) !== undefined)

	result.reverse() // we reverse result to restore the original order
	return result
}

const getAllFiles = (dirPath: string, arrayOfFiles: string[]) => {
	const files = fs.readdirSync(dirPath)

	files.forEach(function(file) {
		if (fs.statSync(dirPath + '/' + file).isDirectory()) {
			arrayOfFiles = getAllFiles(dirPath + '/' + file, arrayOfFiles)
		} else {
			arrayOfFiles.push(path.join( dirPath, '/', file))
		}
	})

	return arrayOfFiles
}

const ROOT_PATH = path.join(__dirname, '../..')
const SCHEMA_REGISTRY_PATH = path.join(ROOT_PATH, './schema-registry')
const PACKAGES_DEFINITION_PATH = path.join(ROOT_PATH, './packages')
const BASE_DIR = 'models/'
const BASE_SERVICE_DIR = `${BASE_DIR}services/`

async function compileJsonToTs() {
	const EVENT_DIR = `${BASE_SERVICE_DIR}activity/`



	const files = [
		
		// `${ACTIVITY_DIR}activity/activity-application-model.v1.json`,
		// `${ACTIVITY_DIR}activity/activity-database-model.v1.json`,
		// `${ACTIVITY_DIR}activity/activity-create-request-model.v1.json`,
	]
	
	
	const promiseArr = files.map((file)=> {
		const sourceFile = path.join(SCHEMA_REGISTRY_PATH, file)
		const sourceFileArr = sourceFile.split('.')
		const sourceFileDir = path.dirname(sourceFile)
		let destFile = ''
		
		for(let i=0; i<sourceFileArr.length -2; i++) {
			destFile += sourceFileArr[i] + '.'
		}

		destFile += 'd.ts'


		return compileFromFile(sourceFile, {
			cwd: sourceFileDir
		})
			.then(ts => fse.writeFile(destFile, ts))
	})

	await Promise.all(promiseArr)
}

async function moveToFinalDestination() {
	const services = [
		'activity',
		'cms',
		'common',
		'goal',
		'journal',
		'measurement',
		'note',
		'notification',
		'subscription',
		'user'
	]

	const promiseArr = services.map((service)=> {
		const schemaDirectory = path.join(SCHEMA_REGISTRY_PATH, BASE_SERVICE_DIR, service)
		const finalDestinationDirectory = path.join(SERVICE_DEFINITION_PATH, `${service}-models/src/__generated__`)

		const listOfFiles = getAllFiles(schemaDirectory, [])
			.filter((file)=> path.extname(file) == '.ts')


		return listOfFiles.map((file)=> {
			const relativePathArr = file.split(schemaDirectory)
			const finalDestination = path.join(finalDestinationDirectory, relativePathArr[1]).replace('.d','')

			return fse.move(file, finalDestination, {
				overwrite: true
			})
		})
	})

	await Promise.all(flatten(promiseArr))
}

(async function() {
	await compileJsonToTs()
	await moveToFinalDestination()

	console.log('DONE')
})()

