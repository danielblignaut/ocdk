import path from 'path'
import fs from 'fs'
import fetch from 'node-fetch'

interface Options {
	url: string
	env: {
		[k: string]: string | number | boolean
	}
	lambda: string
}

export async function addRoute(options: Options) {
	const {
		url,
		...rest
	} = options

	const PATHS_FILE = path.join(__dirname, './../lambda-server/routes.json')

	const paths = JSON.parse(fs.readFileSync(PATHS_FILE, 'utf8'))
	paths[url] = rest

	fs.writeFileSync(PATHS_FILE, JSON.stringify(paths))
	let timesRun = 0
	return new Promise<void>((resolve, reject)=> {
		let innerTimer = null
		const timer = setTimeout(function check() {
			timesRun ++

			fetch(`http://localhost:8200${url}`)
				.then((res)=> {
					clearTimeout(timer)
					clearTimeout(innerTimer)
					return resolve()
				})
				.catch((err)=> {
					console.log(err)
					if(timesRun >= 3) {
						clearTimeout(timer)
						clearTimeout(innerTimer)
						return reject('could not get route up, check server thread')
						
					}
					else {
						innerTimer = setTimeout(check, 20)
					}
				})

			
		}, 20)
	})
}

export function resetRoutes() {
	interface Paths {
		[k: string]: {
			env: {
				[k: string]: number | string | boolean
			}
			lambda: string
		}
	}
	
	const currentPaths: Paths = {
		'/': {
			lambda: path.join(__filename),
			env: {}
		}
	}
	const PATHS_FILE = path.join(__dirname, './../lambda-server/routes.json')


	fs.writeFileSync(PATHS_FILE, JSON.stringify(currentPaths))
}