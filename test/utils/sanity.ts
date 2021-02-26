import { TestType } from './jest'
import sanityClient from '@sanity/client'

export const s = async function(test: TestType) {

	let token = ''
	let projectId = ''
	let dataset = ''
	if(process.env.CI === 'true') {
		test = TestType.REMOTE
	}
	
	switch(test) {
		case TestType.LOCAL: {
			projectId = 'ijnra26f'
			dataset = 'staging'
			token = process.env.SANITY_API_KEY
			break
		}
		case TestType.REMOTE: {
			
			break
		}
	}


	return sanityClient({
		projectId,
		dataset,
		token,
		useCdn: false,
		ignoreBrowserTokenWarning: true
	})
}