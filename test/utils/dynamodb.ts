import {AttributeMap, DocumentClient, Converter} from 'aws-sdk/clients/dynamodb'
import {AWSError, DynamoDB} from 'aws-sdk'
import { DynamoDBRecord, DynamoDBStreamEvent, StreamRecord } from 'aws-lambda'
import  {v4} from 'uuid'
import { TestType } from './jest'
import { getCredentials } from './aws'

export const ddb = async (test: TestType)=> {


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

	const config = {
		convertEmptyValues: true,
		endpoint,
		sslEnabled: false, 
		region: 'eu-west-2'
	}

	const client = new DocumentClient(config)
	if(test == TestType.LOCAL) {
		//@ts-ignore
		client.batchWrite = (params: DocumentClient.BatchWriteItemInput, callback?: (err: AWSError, data: DocumentClient.BatchWriteItemOutput)=> void): { promise: ()=> Promise<any>} => {
			const putRequests: DocumentClient.PutItemInput[] = []
			const deleteRequests: DocumentClient.DeleteItemInput[] = []
			Object.keys(params.RequestItems).forEach((key, index)=> {
				const writeArr = params.RequestItems[key]
				
				writeArr.forEach((item)=> {
					if(item.DeleteRequest != null) {
						deleteRequests.push({
							TableName: key,
							Key: item.DeleteRequest.Key
						})
					}

					if(item.PutRequest != null) {
			
						putRequests.push({
							TableName: key,
							Item: item.PutRequest.Item
						})
					}
				})
			})

			const promiseArrPending = Promise.all([
				...putRequests.map((item)=> client.put(item).promise()),
				...deleteRequests.map((item)=> client.delete(item).promise())
			])
			
			return {
				promise: ()=> promiseArrPending
			}
		}

		//@ts-ignore
		client.batchGet = (params: DocumentClient.BatchGetItemInput, callback?: (err: AWSError, data: DocumentClient.BatchWriteItemOutput)=> void): { promise: ()=> Promise<any>} => {
			const readRequests: DocumentClient.GetItemInput[] = []
			let tableName = ''
			Object.keys(params.RequestItems).forEach((key, index)=> {
				tableName = key
				const readArr = params.RequestItems[key]
				readArr.Keys.forEach((item)=> {
					readRequests.push({
						TableName: key,
						Key: item
					})
				})
			})

			const promiseArrPending = Promise.all([
				...readRequests.map((item)=> client.get(item).promise()),
			])
			
			return {
				promise: ()=> {
					return promiseArrPending
						.then((items)=> {
							
							return {
								Responses: {
									[tableName]: items
										.map((item)=> item.Item)
										.filter((item)=> item != null && Object.keys(item).length > 0)
								}
							}
						})
				}
			}
		}
	}

	return client
}


export const db = async (test: TestType)=> {
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

	const config = {
		convertEmptyValues: true,
		endpoint,
		sslEnabled: false, 
		region: 'eu-west-2'
	}

	return new DynamoDB(config)
}


export async function deleteTable(db: DynamoDB, tableName: string) {
	return await db.deleteTable({
		TableName: tableName
	})
		.promise()
}

export async function emptyTable( db: DynamoDB, tableName: string) {

	const getDbItems = async (items: DynamoDB.ItemList, lastEvaluatedKey?: DynamoDB.Key, isFirstIteration?: boolean)=> {

		if(!isFirstIteration && lastEvaluatedKey == null) {
			return items
		}

		const res = await db.scan({
			TableName: tableName,
			AttributesToGet: [
				'pk',
				'sk'
			],
			Limit: 10000,
			ExclusiveStartKey: lastEvaluatedKey
		})
			.promise()


		items = [
			...items,
			...res.Items
		]
	
		return await getDbItems(items, res.LastEvaluatedKey, false)
	}

	const items: DynamoDB.ItemList = await getDbItems([], null, true)

	
	const batches: AttributeMap[][] = []
	
	while(items.length) {
		batches.push(items.splice(0,25))
	}

	const promises = batches.map((batch)=> {
		const deleteRequestItems = batch.map((item, key)=> ({
			DeleteRequest: {
				Key: {
					pk: {
						S: item.pk.S
					},
					sk: {
						S: item.sk.S
					}
				}
			}
		}))


		return db.batchWriteItem({
			RequestItems: {
				[tableName]: deleteRequestItems
			}
		})
			.promise()
	})
	
	return await Promise.all(promises)
}

interface Options {
	newModel?: object
	oldModel?: object
	keys: object
}

export function generateStreamRecord(options: Options): DynamoDBRecord {
	const {
		newModel,
		oldModel,
		keys
	} = options

	let event: 'INSERT' | 'MODIFY' | 'REMOVE' = 'INSERT'

	if(newModel != null && oldModel != null) {
		event = 'MODIFY'
	}
	else if(newModel != null) {
		event = 'INSERT'
	}
	else {
		event = 'REMOVE'
	}
	const dynamodb: StreamRecord = {
		ApproximateCreationDateTime: Math.floor(new Date().getTime() / 1000),
		//@ts-ignore
		Keys: Converter.marshall(keys),
		...(newModel != null) && {NewImage: Converter.marshall(newModel) },
		...(oldModel != null) && {OldImage: Converter.marshall(oldModel) },
		
		SequenceNumber: v4(),
		SizeBytes: Math.floor(Math.random() * 1000),
		StreamViewType: 'NEW_AND_OLD_IMAGES'
	}


	return {
		awsRegion: 'eu-west-2',
		dynamodb,
		eventID: v4(),
		eventName: event,
		eventSource: 'aws:dynamodb',
		eventSourceARN: v4(),
		eventVersion: '1',
		// userIdentity: undefined,
	}
}

export function generateStream(records: DynamoDBRecord[]): DynamoDBStreamEvent {
	return {
		Records: records
	}
}

export function convertDynamodbStreamRecordToAppStreamRecord(record: DynamoDBRecord, timestamp: Date) {
	return {
		newModel: (record.dynamodb.NewImage != null) ? Converter.unmarshall(record.dynamodb.NewImage): undefined,
		oldModel: (record.dynamodb.OldImage != null) ? Converter.unmarshall(record.dynamodb.OldImage): undefined,
		eventId: record.eventID,
		timestamp: timestamp.toISOString(),
		eventType: record.eventName,
		eventSource: 'DYNAMODB' as const,
	}
}

interface GenerateAppStreamRecordOptions {
	newModel?: any
	oldModel?: any
	timestamp: Date
	typename: string
}

export function generateModifiedDynamoDbStreamRecordForStepFunctions(options: GenerateAppStreamRecordOptions) {

	let eventName = ''

	if(options.newModel != null && options.oldModel != null) {
		eventName = 'MODIFY'
	}
	else if(options.newModel != null) {
		eventName = 'INSERT'
	}
	else if(options.oldModel != null) {
		eventName = 'REMOVE'
	}

	return {
		newModel: options.newModel,
		oldModel: options.oldModel,
		eventId: v4(),
		timestamp: new Date().toISOString(),
		eventType: eventName,
		eventSource: 'DYNAMODB' as const,
		typename: options.typename,
		hasModelFieldChanged: true
	}
}