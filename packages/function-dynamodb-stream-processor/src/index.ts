import 'source-map-support/register'
import AWS, { StepFunctions } from 'aws-sdk'
import yup, { SchemaOf } from 'yup'
import { EnvironmentVariableError, LambdaUnknownEventError } from '@ocdk/library-errors/src'
import { EventType, getLambdaEventSource } from '@ocdk/library-function-event-source/src'
import { didStreamModelsChange } from './utils/did-model-stream-change'
import { Converter } from 'aws-sdk/lib/dynamodb/converter'
import { DynamoDBStreamEvent } from 'aws-lambda'
import {DocumentClient} from 'aws-sdk/lib/dynamodb/document_client'

interface EnvSchema {
	AWS_REGION: string
	DYNAMODB_STREAM_STEP_FUNCTIONS: string
	JEST_WORKER_ID?: string
	MODELS: string
	DYNAMODB_TABLE_NAME: string
}


interface ModifiedDynamoDbStreamRecord {
	newModel?: {
		[k: string]: any
	}
	oldModel?: {
		[k: string]: any
	}
	eventId: string
	timestamp: string
	eventType: 'INSERT' | 'REMOVE' | 'MODIFY'
	eventSource: 'DYNAMODB'
	typename: string
	hasModelFieldChanged: boolean

}

interface ModifiedStream {
	Records: ModifiedDynamoDbStreamRecord[]
}

export const handler = async (rawEvent: unknown): Promise<any> => { 

	const envSchema: SchemaOf<EnvSchema> = yup.object({
		AWS_REGION: yup.string().required(),
		DYNAMODB_STREAM_STEP_FUNCTIONS: yup.string().required(),
		JEST_WORKER_ID: yup.string().oneOf(['1']),
		MODELS: yup.string().required(),
		DYNAMODB_TABLE_NAME: yup.string().required()
	})

	const environmentVariables = {
		AWS_REGION: process.env.AWS_REGION,
		DYNAMODB_STREAM_STEP_FUNCTIONS: process.env.DYNAMODB_STREAM_STEP_FUNCTION,
		JEST_WORKER_ID: process.env.JEST_WORKER_ID,
		MODELS: process.env.MODELS,
		DYNAMODB_TABLE_NAME: process.env.DYNAMODB_TABLE_NAME
	}

	envSchema.validateSync(environmentVariables)

	try {
		envSchema.validateSync(environmentVariables)
	}
	catch(err) {
		throw new EnvironmentVariableError(err.message)
	}

	const isTest = environmentVariables.JEST_WORKER_ID == '1'

	AWS.config.update({
		region: environmentVariables.AWS_REGION,
		...(isTest) ? {
			secretAccessKey: '123',
			accessKeyId: '123'
		}: undefined
	})


	const stepFunctions = new StepFunctions({
		...(isTest && 
			{ 
				endpoint: 'http://localhost:8083', 
				region: 'eu-west-2'
			}
		)
	})

	const documentClient = new DocumentClient({
		...(isTest && 
			{ 
				endpoint: 'http://localhost:4566', 
				region: 'eu-west-2'
			}
		)
	})

	const eventType = getLambdaEventSource(rawEvent)
	
	switch(eventType) {
		case EventType.DYNAMODB: {
			const event = rawEvent as DynamoDBStreamEvent
			
			const recordsThatChanged = event.Records.filter((item)=> didStreamModelsChange({
				newModel: (item.dynamodb.NewImage != null) ? Converter.unmarshall(item.dynamodb.NewImage) : undefined,
				oldModel: (item.dynamodb.OldImage != null) ? Converter.unmarshall(item.dynamodb.OldImage) : undefined,
				typeNameList: environmentVariables.MODELS
					.replace(' ', '')
					.split(',')
					.filter(model => model != 'Event'),
				eventType: item.eventName
			}).didItChange == true)

			let promiseArr = []

			if(recordsThatChanged.length > 0) {
				const eventsToInsert:  = recordsThatChanged.map((record)=> ({

				}))

				promiseArr = [
					...promiseArr,

				]
			}

			if(records.length == 0) {
				return Promise.resolve()
			}
			else {
				const timestamp = new Date()
				const input: ModifiedStream = {
					Records: records.map((record)=> {
						const recordInformation = didStreamModelsChange({
							newModel: (record.dynamodb.NewImage != null) ? Converter.unmarshall(record.dynamodb.NewImage) : undefined,
							oldModel: (record.dynamodb.OldImage != null) ? Converter.unmarshall(record.dynamodb.OldImage) : undefined,
							typeNameList: models,
							eventType: record.eventName
						}) 


						return {
							newModel: (record.dynamodb.NewImage != null) ? Converter.unmarshall(record.dynamodb.NewImage): undefined,
							oldModel: (record.dynamodb.OldImage != null) ? Converter.unmarshall(record.dynamodb.OldImage): undefined,
							eventId: record.eventID,
							timestamp: timestamp.toISOString(),
							eventType: record.eventName,
							eventSource: 'DYNAMODB' as const,
							typename: recordInformation.typename,
							hasModelFieldChanged: recordInformation.didItChange
						}
					})
				}
				
	
				return Promise.all(
					environmentVariables.DYNAMODB_STREAM_STEP_FUNCTIONS
						.split(',')
						.map((stateMachineArn)=> 
							stepFunctions.startExecution({
								stateMachineArn,
								input: JSON.stringify(input)
							})
								.promise()
						)
					
					
				)
			}
				

			break
		}
		
		default: {
			throw new LambdaUnknownEventError('only Dynamodb Stream events supported')
		}
			
	}

	return rawEvent

	
}