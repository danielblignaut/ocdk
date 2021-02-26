import 'reflect-metadata'
import {  createApiTestUser } from './utils/appsync'
import { configureAws, credentials } from './utils/aws'

import { synth, resourceList } from './utils/cdk'
import path from 'path'
import dotenv from 'dotenv'
(async function() {
	dotenv.config({ path: path.join(__dirname, '../.env.test') })

	// console.log('running suite setup')

	// console.log('clearing protobufs')

	if(!resourceList.loaded) {
		console.log('synthing our cloudformation resources')
		synth()
	}

	// console.log('configuring AWS credentials')
	await configureAws()
	// console.log('finished: configuring AWS credentials')

	// console.log('creating and settings us a test user')
	await createApiTestUser()
	// console.log('finished: creating and settings us a test user')
	
	
})()
