import { TestType } from './jest'
import {SecretsManager} from 'aws-sdk'

export const sm = async function(test: TestType) {

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


	return new SecretsManager({
		endpoint: endpoint,
		region: 'eu-west-2'
	})
}