import { EventBridge} from 'aws-sdk'
import { TestType } from './jest'

export const eb = (test: TestType)=> {
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
	
	const config = {
		endpoint,

		region: 'eu-west-2'
	}

	return new EventBridge(config)
}
