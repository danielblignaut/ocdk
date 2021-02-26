
import { SNS} from 'aws-sdk'
import { getCredentials } from './aws'
import { TestType } from './jest'


export const sns = async function(test: TestType) {

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

	return new SNS({
		endpoint: endpoint,
		region: 'eu-west-2'
	})
}

export function generateSendSms() {
	return {
		Message: 'Counterweight Account verification code',
		PhoneNumber: '+447732479572',
		MessageAttributes: {
			'AWS.SNS.SMS.SenderID': {
				'DataType': 'String',
				'StringValue': 'NOREPLYCW'
			}
		}
	}
}
