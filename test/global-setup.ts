import AWS, {  } from 'aws-sdk'
import {  synth } from './utils/cdk'

module.exports = async ()=> {
	console.log('running global setup')
	const remoteStages = [
		'predev',
		'dev',
		'sandbox',
		'staging',
		'production'
	]

	if(process.env.CI == null) {
		if(process.env.STAGE != null && remoteStages.includes(process.env.STAGE)) {
			process.env.CI = 'true'
		}
		else {
			process.env.CI = 'false'
		}
	}

	if(process.env.CI === 'false') {
		console.log('jest running not in CI')
		AWS.config.update({
			secretAccessKey: '123',
			accessKeyId: '123'
		})
	}
	else {
		console.log('jest running in CI')
	}

	console.log(`jest stage is: ${process.env.STAGE}`)

	synth()
}

