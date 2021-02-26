

interface Env {
	[k: string]: any
}

export function lambdaProxyWrapper(env: Env, handler) {
	return async (req, res) => {
		// Here we convert the request into a Lambda event
		const event = req.body

		console.log(req.body)

		try {
			Object.entries(env).forEach(([key, value])=> {
				//@ts-ignore
				process.env[key] = value
			})

			//eslint-disable-next-line
			const AsyncFunction = (async () => {}).constructor



			const response = await handler(event, {})


			console.log('final express response to map:')
			console.log(response)

			if(response != null && response.statusCode != null) {
				res.status(response.statusCode)
			}
			else {
				res.status(200)
			}
	
			if(response != null && response.headers) {
				res.set(response.headers)
			}
			
			Object.entries(env).forEach(([key, value])=> {
				//@ts-ignore
				delete process.env[key]
			})
			
			
			if(response != null && response.body != null) {
				if(response.body == '') {
					return res.json(response.body)
				}
				else {
					return res.json(JSON.parse(response.body))
				}
			}
			else {
				return res.json(response)
			}
		}
		catch(err) {
			console.error(err)
			res.status(500)
			return res.json({
				...err,
				message: err.message,
				stack: err.stack
			})
		}
		
	}
}
