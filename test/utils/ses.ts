
import { SES} from 'aws-sdk'
import { getCredentials } from './aws'
import { TestType } from './jest'
import faker from 'faker'

export const ses = async function(test: TestType) {

	let endpoint = 'http://localhost:9001'

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

	return new SES({
		endpoint: endpoint,
		region: 'eu-west-2'
	})
}

export function generateSendEmail() {
	return {
		Destination: {
			ToAddresses: [
				faker.internet.email()
			]
		},
		Message: {
			Body: {
				Text: {
					Charset: 'UTF-8',
					Data: 'Account verification code'
				}
			},
			Subject: {
				Charset: 'UTF-8',
				Data: 'Counterweight Account verification code'
			}
		},
		Source: 'info@counterweight.org',
	}
}
