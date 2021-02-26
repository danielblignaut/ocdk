
import { SQS} from 'aws-sdk'
import { getCredentials } from './aws'
import { TestType } from './jest'


export const sqs = async function(test: TestType) {

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

	return new SQS({
		endpoint: endpoint,
		region: 'eu-west-2'
	})
}
