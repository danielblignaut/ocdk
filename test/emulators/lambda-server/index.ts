import bodyParser from 'body-parser'
import express from 'express'
import path from 'path'
import fs from 'fs'
import {lambdaProxyWrapper} from './lambda-proxy-wrapper'
import rimraf from 'rimraf'

let router = express.Router()

interface Paths {
	[k: string]: {
		env: {
			[k: string]: number | string | boolean
		}
		lambda: string
	}
}
const currentPaths: Paths = JSON.parse(fs.readFileSync(path.join(__dirname, './routes.json'), 'utf8'))
// const currentPaths: Paths = {
// 	'/': {
// 		lambda: path.join(__dirname, 'index.ts'),
// 		env: {}
// 	}
// }
async function start() {
	return new Promise<void>((resolve, reject)=> {
		rimraf(path.join(__dirname, './routes.json'), {}, ()=> {
			resolve()
		})
	})
		.then(()=> {
			new Promise<void>((resolve, reject)=> {
				const app = express()
				fs.writeFileSync(path.join(__dirname, './routes.json'), JSON.stringify(currentPaths))
				
				app.use(function (req, res, next) {
					if(req.headers['content-type'] == null || req.headers['content-type'].length == 0) {
						req.headers['content-type'] = 'application/json'
					}

					next()
				})
				app.use(express.json())
				// const urlencodedParser = bodyParser.raw()
				// app.use(urlencodedParser)

				Object.entries(currentPaths).forEach(([key, value])=> {
					router.get(key, lambdaProxyWrapper(value.env, require(value.lambda).handler))
					router.post(key, lambdaProxyWrapper(value.env, require(value.lambda).handler))
				})
				
				//TODO: below we are fixing an issue with step functions local which doesnt map responses correctly from the lambda
				// app.use(function(req,res,next) {
				// 	if(req.body != null) {
				// 		const recursivelyFixBody = (oldBodyObject)=> {
							

				// 			if(typeof oldBodyObject === 'object') {
				// 				const newBodyObject = {}
				// 				Object.entries(oldBodyObject).forEach(([key, value])=> {
				// 					//@ts-ignore
				// 					if(value.Payload != null) {
				// 						//@ts-ignore
				// 						newBodyObject[key] = recursivelyFixBody(value.Payload)
				// 					}
				// 					else if(Array.isArray(value)) {
				// 						newBodyObject[key] = value
				// 					}
				// 					else if(typeof value === 'object') {
				// 						newBodyObject[key] = recursivelyFixBody(value)
				// 					}
				// 					else {
				// 						newBodyObject[key] = value
				// 					}
				// 				})

				// 				return newBodyObject
				// 			}
				// 			else {
				// 				return oldBodyObject
				// 			}
							
				// 		}

				// 		req.body = recursivelyFixBody(req.body)
						
				// 		console.log(req.body)
				// 		// if(req.body.input.dynamoDbStreamBinary) {
				// 		// 	console.log(req.body.input.dynamoDbStreamBinary.Payload)
				// 		// }
				// 	}
					
				// 	next()
				// })
	
				app.use(function (req, res, next) {
					console.log('REQUEST RECEIVED')
					router(req, res, next)
				})
	
	
				
	
				// route and their handlers
				app.listen(8200, () => {
					console.info('Lambda server running on port 8200...')
					
					setInterval(()=> {
						const paths: Paths = JSON.parse(fs.readFileSync(path.join(__dirname, './routes.json'), 'utf8'))
						let changes = false
						Object.entries(paths).forEach(([key, value])=> {
							if(currentPaths[key] == null) {
								currentPaths[key] = value
								changes = true
							}
						})
	
						Object.entries(currentPaths).forEach(([key, value])=> {
							if(paths[key] == null) {
								delete currentPaths[key]
								changes = true
							}
						})
	
						if(changes) {
							console.log('resetting router:')
							console.log(currentPaths)
							const newRouter = express.Router()
							Object.entries(currentPaths).forEach(([key, value])=> {
								newRouter.get(key, lambdaProxyWrapper(value.env, require(value.lambda as string).handler))
								newRouter.post(key, lambdaProxyWrapper(value.env, require(value.lambda as string).handler))
							})
	
							router = newRouter
						}
					},100)
					
					return resolve()

				})
	
				
			})
		})
	
}

export const handler = (e: any, ctx: any)=> {
	return {
		message: 'lambda server running'
	}
}

start()