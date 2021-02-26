import { TestType } from './jest'
import {getCredentials} from './aws'
import path from 'path'
import { APIGateway } from 'aws-sdk'
import  axiosClient from 'axios'
import { createApiTestUser } from './appsync'
import { sign } from 'aws4'
import fs from 'fs'
export const apig = async (test: TestType)=> {
	let endpoint = 'http://localhost:4566'

	if(process.env.CI === 'true') {
		test = TestType.REMOTE
	}

	switch(test) {
		case TestType.LOCAL: {
			break
		}
		case TestType.REMOTE: {
			endpoint = undefined
			break
		}
	}
	
	await getCredentials()

	return new APIGateway({
		endpoint,
		region: 'eu-west-2'
	})
} 

const TEMP_CREDS_PATH = path.join(__dirname, 'test-api-aws-credentials.json')

export const axios = async ()=> {
	const user = await createApiTestUser()
	await user.credentials.getPromise()
	await user.credentials.refreshPromise()
	const token = user.session.getIdToken().getJwtToken()
	axiosClient.interceptors.request.use(async (req)=> {

		const parser = new URL(req.url)
		const options = {
			service: 'execute-api',
			host: parser.hostname,
			path: parser.pathname,
			// region: 'eu-west-2',
			method: 'POST',
		}
		const signature = sign(options, {
			accessKeyId: user.credentials.accessKeyId,
			secretAccessKey: user.credentials.secretAccessKey,
			sessionToken: user.credentials.sessionToken
		})

		req.headers = {
			...signature.headers,
			'content-type': 'application/json'
		}

		return req
	})


	axiosClient.defaults.adapter = require('axios/lib/adapters/http')

	return axiosClient
}
