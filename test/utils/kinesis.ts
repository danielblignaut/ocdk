import Kinesis from 'aws-sdk/clients/kinesis'
import { getCredentials } from './aws'
import { TestType } from './jest'


export const k = async function(test: TestType) {

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

	return new Kinesis({
		endpoint: endpoint,
		region: 'eu-west-2'
	})
}

export const createStream = async (client: Kinesis, streamName: string) => {
	
	await client.createStream({
		StreamName: streamName,
		ShardCount: 1
	})
		.promise()
		//eslint-disable-next-line
		.catch((err)=> {})

	//TODO: localstack puts kinesis stream into creating for 500ms, need to wait
	await new Promise<void>((resolve, reject)=> {
		setTimeout(()=> {
			resolve()
		}, 500)
	})
}

export const deleteStream = async (client: Kinesis, streamName: string) => {
	
	await client.deleteStream({
		StreamName: streamName
	})
		.promise()
	

	//TODO: localstack puts kinesis stream into creating for 500ms, need to wait
	await new Promise<void>((resolve, reject)=> {
		setTimeout(()=> {
			resolve()
		}, 500)
	})
}

