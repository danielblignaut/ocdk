
import { StepFunctions} from 'aws-sdk'
import { getCredentials } from './aws'
import { TestType } from './jest'


export const sf = async function(test: TestType) {

	let endpoint = 'http://localhost:8083'

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

	return new StepFunctions({
		endpoint: endpoint,
		region: 'eu-west-2'
	})
}

export async function pingTillComplete(stepFunctions: StepFunctions, executionArn: string): Promise<StepFunctions.DescribeExecutionOutput> {
	return await new Promise<StepFunctions.DescribeExecutionOutput>((resolve, reject)=> {
		let timer = setTimeout(function checkCompletion() {
			const execution = stepFunctions.describeExecution({
				executionArn: executionArn
			})
				.promise()
				.then((execution)=> {
					if(execution.status == 'RUNNING') {
						//@ts-ignore
						timer = setTimeout(checkCompletion, 500)
					}
					else {
						resolve(execution)
						
						clearTimeout(timer)
					}
				})
		}, 500)
		
	})
}