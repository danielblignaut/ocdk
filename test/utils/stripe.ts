import { TestType } from './jest'
import Stripe from 'stripe'




export const s = async function(test: TestType) {

	let secret = ''
	if(process.env.CI === 'true') {
		test = TestType.REMOTE
	}
	
	switch(test) {
		case TestType.LOCAL: {
			secret = process.env.STRIPE_SECRET_KEY
			break
		}
		case TestType.REMOTE: {
			
			break
		}
	}


	return new Stripe(secret,{
		apiVersion: '2020-08-27'
	})
}