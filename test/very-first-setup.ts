import { CfnStateMachine } from '@aws-cdk/aws-stepfunctions'
import { TagManager, Token } from '@aws-cdk/core'
import AWS, { AWSError, APIGateway, CognitoIdentity, CognitoIdentityServiceProvider, DynamoDB, StepFunctions, EventBridge, SecretsManager } from 'aws-sdk'
import path from 'path'
import { addRoute, resetRoutes } from './emulators/lambda-server/utils'
import { buildCfnString, configureAws } from './utils/aws'
import { getResourceList, synth, testAppStack } from './utils/cdk'
import { createCMSTable } from './utils/cms/dynamodb'
import { db, deleteTable } from './utils/dynamodb'
import { TestType } from './utils/jest'
import { createMeasurementTable } from './utils/measurement/dynamodb'
import { createNoteTable } from './utils/note/dynamodb'
import { createUserTable } from './utils/user/dynamodb'
import fs from 'fs'
import { createGoalTable } from './utils/goal/dynamodb'
import { createActivityTable } from './utils/activity/dynamodb'
import { createJournalTable } from './utils/journal/dynamodb'
import { createNotificationTable } from './utils/notification/dynamodb'
import { createSubscriptionTable } from './utils/subscription/dynamodb'
import dotenv from 'dotenv'
import { ExecutionListItem } from 'aws-sdk/clients/stepfunctions'

async function waitPlease(time = 200) {
	return new Promise<void>((resolve)=> {
		setTimeout(()=> {
			return resolve()
		}, time)
	})
}


function flatten<T>(array: any[], mutable = false): T[] {
	const toString = Object.prototype.toString
	const arrayTypeStr = '[object Array]'

	const result = []
	const nodes = (mutable && array) || array.slice()
	let node

	if (!array.length) {
		return result
	}

	node = nodes.pop()

	do {
		if (toString.call(node) === arrayTypeStr) {
			//eslint-disable-next-line
			nodes.push.apply(nodes, node)
		} else {
			result.push(node)
		}
	} while (nodes.length && (node = nodes.pop()) !== undefined)

	result.reverse() // we reverse result to restore the original order
	return result
}

async function setup() {
	require('./pre-test.js')
	dotenv.config({ path: path.join(__dirname, '../.env.test') })

	console.log('running pre-jest setup')
	const remoteStages = [
		'predev',
		'dev',
		'sandbox',
		'staging',
		'production'
	]
	
	if(process.env.CI == null) {
		if(process.env.STAGE != null && remoteStages.includes(process.env.STAGE)) {
			process.env.CI = 'true'
		}
		else {
			process.env.CI = 'false'
		}
	}
	
	const filesToDelete = [
		'./utils/test-api-aws-credentials.json',
		'./utils/test-aws-credentials.json',
		'./utils/test-cloud-assembly.json'
	]

	filesToDelete.forEach((file)=> {
		const filePath = path.join(__dirname, file)
		
		if (fs.existsSync(filePath)) {
			// fs.unlinkSync(filePath)
		}
	})


	await configureAws()
	synth()
	const resourceList = await getResourceList()
	
	if(process.env.CI === 'false') {
		console.log('running pre-jest setup not in CI')
		AWS.config.update({
			secretAccessKey: '123',
			accessKeyId: '123'
		})
		const endpoint = 'http://localhost:4566'
		const region = 'eu-west-2'
		
		const dynamodb = new DynamoDB({
			endpoint,
			sslEnabled: false, 
			region
		})
		
		const cognito = new CognitoIdentityServiceProvider({
			endpoint,
			region
		})
		const identity = new CognitoIdentity({
			endpoint,
			region
		})
		const s3 = new AWS.S3({
			endpoint,
			region,
			s3ForcePathStyle: true
		})
		const stepFunctions = new StepFunctions({
			endpoint: 'http://localhost:8083',
			region
		})

		const eventBridge = new EventBridge({
			endpoint,
			region,
		})

		const secretsManager = new SecretsManager({
			endpoint,
			region
		})

		const apigateway = new APIGateway({
			endpoint,
			region
		})

		
		

		// await eventBridge.putRule({
		// 	Name: 'send-cognito-identity-user-mapping-to-journal',
		// 	Description: 'sends the user cognito identity mapping event to journal service for processing',
		// 	EventBusName: 'conductor-bridge',
		// 	EventPattern: JSON.stringify({
		// 		'detail-type': 'INSERT IdentityToUserMapping',
		// 		source: ['counterweight.user']
		// 	})
		// }).promise()

		// await eventBridge.putRule({
		// 	Name: 'send-create-user-user-mapping-to-journal',
		// 	Description: 'sends the user cognito identity mapping event to journal service for processing',
		// 	EventBusName: 'conductor-bridge',
		// 	EventPattern: JSON.stringify({
		// 		'detail-type': 'INSERT IdentityToUserMapping',
		// 		source: ['counterweight.user']
		// 	}),
			
		// }).promise()

		
	
		let tables = await dynamodb.listTables({
			Limit: 25
		}).promise()
		
		const userpools = await cognito.listUserPools({
			MaxResults: 25
		}).promise()
		const buckets = await s3.listBuckets().promise()
		const identityPools = await identity.listIdentityPools({
			MaxResults: 25
		}).promise()
		let stateMachines = await stepFunctions.listStateMachines({
			maxResults: 25
		}).promise()

		const eventBusses = await eventBridge.listEventBuses({
			Limit: 25
		}).promise()
		let secrets = await secretsManager.listSecrets({
			MaxResults: 25
		}).promise()

		//delete all db tables
		await Promise.all(
			tables.TableNames.map((TableName)=> dynamodb.deleteTable({
				TableName
			}).promise())
		)

		//delete all secrets
		await Promise.all(
			secrets.SecretList.map((secret)=> secretsManager.deleteSecret({
				SecretId: secret.Name,
				ForceDeleteWithoutRecovery: true
			}).promise())
		)

		//delete all state machines
		const executions = flatten<ExecutionListItem>(await Promise.all(
			stateMachines.stateMachines.map((sm)=>stepFunctions.listExecutions({
				stateMachineArn: sm.stateMachineArn,
				maxResults: 20,
				statusFilter: 'RUNNING'
			}).promise().then((res)=> Promise.resolve(res.executions)))
		))

		await Promise.all(executions.map(execution => stepFunctions.stopExecution({
			executionArn: execution.executionArn
		}).promise()))

		await Promise.all(
			stateMachines.stateMachines.map((sm)=>stepFunctions.deleteStateMachine({
				stateMachineArn: sm.stateMachineArn,
			}).promise())
		)

		secrets = await secretsManager.listSecrets({
			MaxResults: 25
		}).promise()

		await waitPlease(1000)

		//list resources again
		tables = await dynamodb.listTables({
			Limit: 25
		}).promise()
		stateMachines = await stepFunctions.listStateMachines({
			maxResults: 25
		}).promise()


		const oldBus = eventBusses.EventBuses.find((item => item.Name == 'conductor-bridge'))

		if(oldBus != null) {
			await eventBridge.deleteEventBus({
				Name: 'conductor-bridge'
			})
				.promise()
		}

		const conductorBridge = await eventBridge.createEventBus({
			Name: 'conductor-bridge'
		})
			.promise()
		
		
		await resetRoutes()
		/*
			USER
		*/
	
		if(tables.TableNames.includes('User')) {
			await deleteTable(dynamodb, 'User')
		}
		await createUserTable(dynamodb)
	
		
	
	
		const pool = userpools.UserPools.find((item)=> item.Name == 'user-userpool')
	
		if(pool != null) {
			const userPoolClients = await cognito.listUserPoolClients({
				UserPoolId: pool.Id,
				MaxResults: 25
			}).promise()
	
			const promises = userPoolClients.UserPoolClients.map((item)=> cognito.deleteUserPoolClient({
				ClientId: item.ClientId,
				UserPoolId: item.UserPoolId
			}).promise())
	
			await Promise.all(promises)
	
	
			await cognito.deleteUserPool({
				UserPoolId: pool.Id
			}).promise()
		}
	
		const userpool = await cognito.createUserPool({
			PoolName: 'user-userpool'
		}).promise()
	
		const client = await cognito.createUserPoolClient({
			UserPoolId: userpool.UserPool.Id,
			ClientName: 'test-client',
			GenerateSecret: false,
			ExplicitAuthFlows: [
			]
		}).promise()
	
		const idPool = identityPools.IdentityPools.find((item)=> item.IdentityPoolName == 'user_microservice_identity_pool')
	
		if(idPool != null) {
			try {
				await identity.deleteIdentityPool({
					IdentityPoolId: idPool.IdentityPoolId
				}).promise()
			}
			//eslint-disable-next-line
			catch(err) {}
		}
	
		await identity.createIdentityPool({
			IdentityPoolName: 'user_microservice_identity_pool',
			AllowUnauthenticatedIdentities: true,
			CognitoIdentityProviders: [
				{
					ProviderName: 'test',
					ClientId: client.UserPoolClient.ClientId
				}
			]
	
		}).promise()
		
	
		const profilePictureBucket = buckets.Buckets.find((item)=> item.Name == 'counterweight-user-profile-pictures-sandbox')
	
		if(profilePictureBucket != null) {
			let truncated = true
			let items: AWS.S3.ObjectList = []
			let continuationToken: undefined | string = undefined
			while(truncated) {
				const tempItems = await s3.listObjectsV2({
					Bucket: profilePictureBucket.Name,
					MaxKeys: 25,
					ContinuationToken: continuationToken
				}).promise()
	
				items = [
					...items,
					...tempItems.Contents
				]
	
				truncated = tempItems.IsTruncated
				continuationToken = tempItems.NextContinuationToken
			}
	
			const promises = items.map((item)=> s3.deleteObject({
				Bucket: profilePictureBucket.Name,
				Key: item.Key
			}).promise())
	
			await Promise.all(promises)
	
	
			await s3.deleteBucket({
				Bucket: profilePictureBucket.Name
			}).promise()
		}
	
		await s3.createBucket({
			Bucket: 'counterweight-user-profile-pictures-sandbox'
		}).promise()
		
		await addRoute({
			url: '/2015-03-31/functions/user-function-service/invocations',
			lambda: path.join(__dirname, '../packages/user-function-service/src/index.ts'),
			env: {
				AWS_REGION: 'eu-west-2',
				DYNAMODB_TABLE_NAME: 'User',
				JEST_WORKER_ID: '1',
				COGNITO_USER_POOL_ID: userpool.UserPool.Id,
				SES_FROM_EMAIL_ADDRESS: 'info@counterweight.org',
				S3_BUCKET_NAME: 'counterweight-user-profile-pictures-sandbox',
				SERVICE_NAME: 'counterweight.user',
				EVENT_BUS_NAME: 'conductor-bridge'
			}
		})
		
		//delete unverified attributes
		const userDeleteUnverifiedAttributes = stateMachines.stateMachines.find((item)=> item.name == 'user-delete-unverified-attributes')
	
		if(userDeleteUnverifiedAttributes != null) {
			const executions = await stepFunctions.listExecutions({
				stateMachineArn: userDeleteUnverifiedAttributes.stateMachineArn,
				maxResults: 100
			}).promise()

			const activeExecutions = executions.executions.filter((item)=> item.status == 'RUNNING')

			if(activeExecutions.length > 0) {
				const promises = activeExecutions.map((item)=> stepFunctions.stopExecution({
					executionArn: item.executionArn
				}).promise())

				await Promise.all(promises)
			}

			const res = await stepFunctions.deleteStateMachine({
				stateMachineArn: userDeleteUnverifiedAttributes.stateMachineArn
			}).promise()
			await waitPlease()
			
		}
		
		const sm1 = resourceList.stepFunctions.find((item)=> 
		{
			return TagManager.isTaggable(item) && 
			item.tags.tagValues()['service'] == 'user' && 
			(item as CfnStateMachine).stateMachineName == 'user-delete-unverified-attributes'
		})
		const definition1 = testAppStack.resolve(sm1.definitionString)
		const definition1String = buildCfnString(definition1, {
			'AWS::Partition': '*',
			appuserresourcesstack45311935nestedtemplatejsonusertasks3F88FBF43F898C59: {
				Arn: 'user-function-service'
			}
		})
	
		const deleterUnverifiedAttributes = await stepFunctions.createStateMachine({
			definition: definition1String,
			name: 'user-delete-unverified-attributes',
			roleArn: 'arn:aws:iam::000000000000:role/a-role'
		})
			.promise()
	
		//build process-dynamodb-streams
		const userProcessDynamoDbStreams = stateMachines.stateMachines.find((item)=> item.name == 'user-process-dynamodb-stream')
	
		if(userProcessDynamoDbStreams != null) {
			const executions = await stepFunctions.listExecutions({
				stateMachineArn: userProcessDynamoDbStreams.stateMachineArn,
				maxResults: 100
			}).promise()

			const activeExecutions = executions.executions.filter((item)=> item.status == 'RUNNING')

			if(activeExecutions.length > 0) {
				const promises = activeExecutions.map((item)=> stepFunctions.stopExecution({
					executionArn: item.executionArn
				}).promise())

				await Promise.all(promises)
			}

			const res = await stepFunctions.deleteStateMachine({
				stateMachineArn: userProcessDynamoDbStreams.stateMachineArn
			}).promise()
			await waitPlease()
		}
	
		const sm = resourceList.stepFunctions.find((item)=> 
		{
			return TagManager.isTaggable(item) && 
			item.tags.tagValues()['service'] == 'user' && 
			(item as CfnStateMachine).stateMachineName == 'user-process-dynamodb-stream'
		})
		
		const definition = testAppStack.resolve(sm.definitionString)
		const definitionString = buildCfnString(definition, {
			'AWS::Partition': '*',
			appuserresourcesstack45311935nestedtemplatejsonusertasks3F88FBF43F898C59: {
				Arn: 'user-function-service'
			},
	
			appuserresourcesstack45311935nestedtemplatejsondeleteunverifiedattributes76AC7756A4CC742F: deleterUnverifiedAttributes.stateMachineArn
		})
	
		await stepFunctions.createStateMachine({
			definition: definitionString,
			name: 'user-process-dynamodb-stream',
			roleArn: 'arn:aws:iam::000000000000:role/a-role'
		})
			.promise()

		
		/*
			NOTE
		*/
		if(tables.TableNames.includes('Note')) {
			await deleteTable(dynamodb, 'Note')
		}
	
		await createNoteTable(dynamodb)
	
		
	
	
		await addRoute({
			url: '/2015-03-31/functions/note-function-service/invocations',
			lambda: path.join(__dirname, '../packages/note-function-service/src/index.ts'),
			env: {
				AWS_REGION: 'eu-west-2',
				DYNAMODB_TABLE_NAME: 'Note',
				JEST_WORKER_ID: '1',
				SERVICE_NAME: 'counterweight.note',
				EVENT_BUS_NAME: 'conductor-bridge'
			}
		})
	
		//build process-dynamodb-streams
		const noteProcessDynamoDbStreams = stateMachines.stateMachines.find((item)=> item.name == 'note-process-dynamodb-stream')
	
		if(noteProcessDynamoDbStreams != null) {
			const executions = await stepFunctions.listExecutions({
				stateMachineArn: noteProcessDynamoDbStreams.stateMachineArn,
				maxResults: 100
			}).promise()

			const activeExecutions = executions.executions.filter((item)=> item.status == 'RUNNING')

			if(activeExecutions.length > 0) {
				const promises = activeExecutions.map((item)=> stepFunctions.stopExecution({
					executionArn: item.executionArn
				}).promise())

				await Promise.all(promises)
			}

			const res = await stepFunctions.deleteStateMachine({
				stateMachineArn: noteProcessDynamoDbStreams.stateMachineArn
			}).promise()
			
		}
	
		const noteSm = resourceList.stepFunctions.find((item)=> 
		{
			return TagManager.isTaggable(item) && 
			item.tags.tagValues()['service'] == 'note' && 
			(item as CfnStateMachine).stateMachineName == 'note-process-dynamodb-stream'
		})
		
		const ntoeDefintiion = testAppStack.resolve(noteSm.definitionString)
		const noteDefinitionString = buildCfnString(ntoeDefintiion, {
			'AWS::Partition': '*',
			appnoteresourcesstack73041EE4nestedtemplatejsonservice6D174F8381CC9DB8: {
				Arn: 'note-function-service'
			},		
		})
	
		const res = await stepFunctions.createStateMachine({
			definition: noteDefinitionString,
			name: 'note-process-dynamodb-stream',
			roleArn: 'arn:aws:iam::000000000000:role/a-role'
		})
			.promise()

	
		/*
			MEASUREMENT
		*/
		if(tables.TableNames.includes('Measurement')) {
			await deleteTable(dynamodb, 'Measurement')
		}
		
		await createMeasurementTable(dynamodb)
		
		
		
	
		await addRoute({
			url: '/2015-03-31/functions/measurement-function-service/invocations',
			lambda: path.join(__dirname, '../packages/measurement-function-service/src/index.ts'),
			env: {
				AWS_REGION: 'eu-west-2',
				DYNAMODB_TABLE_NAME: 'Measurement',
				JEST_WORKER_ID: '1',
				SERVICE_NAME: 'counterweight.measurement',
				EVENT_BUS_NAME: 'conductor-bridge'
			}
		})
	
		//build process-dynamodb-streams
		const measurementProcessDynamoDbStreams = stateMachines.stateMachines.find((item)=> item.name == 'measurement-process-dynamodb-stream')
	
		if(measurementProcessDynamoDbStreams != null) {
			const executions = await stepFunctions.listExecutions({
				stateMachineArn: measurementProcessDynamoDbStreams.stateMachineArn,
				maxResults: 100
			}).promise()

			const activeExecutions = executions.executions.filter((item)=> item.status == 'RUNNING')

			if(activeExecutions.length > 0) {
				const promises = activeExecutions.map((item)=> stepFunctions.stopExecution({
					executionArn: item.executionArn
				}).promise())

				await Promise.all(promises)
			}

			const res = await stepFunctions.deleteStateMachine({
				stateMachineArn: measurementProcessDynamoDbStreams.stateMachineArn
			}).promise()
			await waitPlease()
		}
	
		const measurementSm = resourceList.stepFunctions.find((item)=> 
		{
			return TagManager.isTaggable(item) && 
			item.tags.tagValues()['service'] == 'measurement' && 
			(item as CfnStateMachine).stateMachineName == 'measurement-process-dynamodb-stream'
		})
		
		const measurementDefintiion = testAppStack.resolve(measurementSm.definitionString)
		const measurementDefinitionString = buildCfnString(measurementDefintiion, {
			'AWS::Partition': '*',
			appmeasurementresourcesstack75B6C6E3nestedtemplatejsonservice6D174F8306F41393: {
				Arn: 'measurement-function-service'
			},		
		})
	
		await stepFunctions.createStateMachine({
			definition: measurementDefinitionString,
			name: 'measurement-process-dynamodb-stream',
			roleArn: 'arn:aws:iam::000000000000:role/a-role'
		})
			.promise()

		/*
			CMS
		*/
		const sanityApiSecret = secrets.SecretList.find((item)=> item.Name == 'SANITY_AUTH_TOKEN_KEY')
		let sanityApiSecretKey = ''
		
		if(sanityApiSecret != null) {
			const res1 = await secretsManager.restoreSecret({
				SecretId: sanityApiSecret.Name,
				
			}).promise()
			const res = await secretsManager.updateSecret({
				SecretId: res1.Name,
				SecretString: 'skIhiRXoz752cqbak7dv2AMVBbA22ThzrWgZiGjg8vWoGthSLj9CqyuRW6yieVLwLmyFfqn596EOfgzL7XHmQOB8bFki8pMk6GiOjZJ15poevePd6f6vjQkWboXsJPTHrg2zLdqFgznLBBfWNt8yNxmnN1znldLwsIeae8pMETqD6SxorCZy'
			}).promise()
			sanityApiSecretKey = res.Name
		}
		else {
			const res = await secretsManager.createSecret({
				Name: 'SANITY_AUTH_TOKEN_KEY',
				SecretString: 'skIhiRXoz752cqbak7dv2AMVBbA22ThzrWgZiGjg8vWoGthSLj9CqyuRW6yieVLwLmyFfqn596EOfgzL7XHmQOB8bFki8pMk6GiOjZJ15poevePd6f6vjQkWboXsJPTHrg2zLdqFgznLBBfWNt8yNxmnN1znldLwsIeae8pMETqD6SxorCZy'
			}).promise()
			sanityApiSecretKey = res.Name
		}

		const sanityWebhookSecret = secrets.SecretList.find((item)=> item.Name == 'SANITY_SECRET_WEBHOOK_KEY')
		
		let sanityWebhookSecretKey = ''
		if(sanityWebhookSecret != null) {
			const res1 = await secretsManager.restoreSecret({
				SecretId: sanityWebhookSecret.Name,
				
			}).promise()
			const res =await secretsManager.updateSecret({
				SecretId: res1.Name,
				SecretString: '123'
			}).promise()

			sanityWebhookSecretKey = res.Name
			
		}
		else {
			const res = await secretsManager.createSecret({
				Name: 'SANITY_SECRET_WEBHOOK_KEY',
				SecretString: '123'
			}).promise()

			sanityWebhookSecretKey = res.Name
		}
		if(tables.TableNames.includes('CMS')) {
			await deleteTable(dynamodb, 'CMS')
		}
		
		await createCMSTable(dynamodb)
		
	
		
	
		await addRoute({
			url: '/2015-03-31/functions/cms-function-service/invocations',
			lambda: path.join(__dirname, '../packages/cms-function-service/src/index.ts'),
			env: {
				AWS_REGION: 'eu-west-2',
				DYNAMODB_TABLE_NAME: 'CMS',
				JEST_WORKER_ID: '1',
				SERVICE_NAME: 'counterweight.cms',
				EVENT_BUS_NAME: 'conductor-bridge',
				SSM_SANITY_API_SECRET_KEY: sanityApiSecretKey,
				SSM_SANITY_WEBHOOK_SECRET_KEY: sanityWebhookSecretKey,
				SANITY_PROJECT_ID: 'ijnra26f',
				SANITY_DATASET_NAME: 'staging'
			}
		})
	
		//build process-dynamodb-streams
		const cmsProcessDynamoDbStreams = stateMachines.stateMachines.find((item)=> item.name == 'cms-process-dynamodb-stream')
	
		if(cmsProcessDynamoDbStreams != null) {
			const executions = await stepFunctions.listExecutions({
				stateMachineArn: cmsProcessDynamoDbStreams.stateMachineArn,
				maxResults: 100
			}).promise()

			const activeExecutions = executions.executions.filter((item)=> item.status == 'RUNNING')

			if(activeExecutions.length > 0) {
				const promises = activeExecutions.map((item)=> stepFunctions.stopExecution({
					executionArn: item.executionArn
				}).promise())

				await Promise.all(promises)
			}

			const res = await stepFunctions.deleteStateMachine({
				stateMachineArn: cmsProcessDynamoDbStreams.stateMachineArn
			}).promise()
			await waitPlease()
			
		}
	
		const cmsSm = resourceList.stepFunctions.find((item)=> 
		{
			return TagManager.isTaggable(item) && 
			item.tags.tagValues()['service'] == 'cms' && 
			(item as CfnStateMachine).stateMachineName == 'cms-process-dynamodb-stream'
		})
		
		const cmsDefintiion = testAppStack.resolve(cmsSm.definitionString)
		const cmsDefinitionString = buildCfnString(cmsDefintiion, {
			'AWS::Partition': '*',
			appcmsresourcesstack58B64785nestedtemplatejsonservice6D174F83047EEB6E: {
				Arn: 'cms-function-service'
			},		
		})
	
		await stepFunctions.createStateMachine({
			definition: cmsDefinitionString,
			name: 'cms-process-dynamodb-stream',
			roleArn: 'arn:aws:iam::000000000000:role/a-role'
		})
			.promise()

		/*
			GOAL
		*/
		if(tables.TableNames.includes('Goal')) {
			await deleteTable(dynamodb, 'Goal')
		}
	
		await createGoalTable(dynamodb)
	
	
	
	
		await addRoute({
			url: '/2015-03-31/functions/goal-function-service/invocations',
			lambda: path.join(__dirname, '../packages/goal-function-service/src/index.ts'),
			env: {
				AWS_REGION: 'eu-west-2',
				DYNAMODB_TABLE_NAME: 'Goal',
				JEST_WORKER_ID: '1',
				SERVICE_NAME: 'counterweight.goal',
				EVENT_BUS_NAME: 'conductor-bridge'
			}
		})
	
		//build process-dynamodb-streams
		const goalProcessDynamoDbStreams = stateMachines.stateMachines.find((item)=> item.name == 'goal-process-dynamodb-stream')
	
		if(goalProcessDynamoDbStreams != null) {
			const executions = await stepFunctions.listExecutions({
				stateMachineArn: goalProcessDynamoDbStreams.stateMachineArn,
				maxResults: 100
			}).promise()

			const activeExecutions = executions.executions.filter((item)=> item.status == 'RUNNING')

			if(activeExecutions.length > 0) {
				const promises = activeExecutions.map((item)=> stepFunctions.stopExecution({
					executionArn: item.executionArn
				}).promise())

				await Promise.all(promises)
			}

			const res = await stepFunctions.deleteStateMachine({
				stateMachineArn: goalProcessDynamoDbStreams.stateMachineArn
			}).promise()
			await waitPlease()
			
		}
	
		const goalSm = resourceList.stepFunctions.find((item)=> 
		{
			return TagManager.isTaggable(item) && 
			item.tags.tagValues()['service'] == 'goal' && 
			(item as CfnStateMachine).stateMachineName == 'goal-process-dynamodb-stream'
		})
		
		const goalDefinition = testAppStack.resolve(goalSm.definitionString)
		const goalDefinitionString = buildCfnString(goalDefinition, {
			'AWS::Partition': '*',
			appgoalresourcesstackEA4D6EE5nestedtemplatejsonservice6D174F83079F9B39: {
				Arn: 'goal-function-service'
			},		
		})
	
		await stepFunctions.createStateMachine({
			definition: goalDefinitionString,
			name: 'goal-process-dynamodb-stream',
			roleArn: 'arn:aws:iam::000000000000:role/a-role'
		})
			.promise()

		/*
			ACTIVITY
		*/
		if(tables.TableNames.includes('Activity')) {
			await deleteTable(dynamodb, 'Activity')
		}
	
		await createActivityTable(dynamodb)
	
		
	
		await addRoute({
			url: '/2015-03-31/functions/activity-function-service/invocations',
			lambda: path.join(__dirname, '../packages/activity-function-service/src/index.ts'),
			env: {
				AWS_REGION: 'eu-west-2',
				DYNAMODB_TABLE_NAME: 'Activity',
				JEST_WORKER_ID: '1',
				SERVICE_NAME: 'counterweight.activity',
				EVENT_BUS_NAME: 'conductor-bridge'
			}
		})
	
		//build process-dynamodb-streams
		const activityProcessDynamoDbStreams = stateMachines.stateMachines.find((item)=> item.name == 'activity-process-dynamodb-stream')
	
		if(activityProcessDynamoDbStreams != null) {
			const executions = await stepFunctions.listExecutions({
				stateMachineArn: activityProcessDynamoDbStreams.stateMachineArn,
				maxResults: 100
			}).promise()

			const activeExecutions = executions.executions.filter((item)=> item.status == 'RUNNING')

			if(activeExecutions.length > 0) {
				const promises = activeExecutions.map((item)=> stepFunctions.stopExecution({
					executionArn: item.executionArn
				}).promise())

				await Promise.all(promises)
			}

			const res = await stepFunctions.deleteStateMachine({
				stateMachineArn: activityProcessDynamoDbStreams.stateMachineArn
			}).promise()
			await waitPlease()
		}
	
		const activitySm = resourceList.stepFunctions.find((item)=> 
		{
			return TagManager.isTaggable(item) && 
			item.tags.tagValues()['service'] == 'activity' && 
			(item as CfnStateMachine).stateMachineName == 'activity-process-dynamodb-stream'
		})
		
		const activityDefinition = testAppStack.resolve(activitySm.definitionString)
		const activityDefinitionString = buildCfnString(activityDefinition, {
			'AWS::Partition': '*',
			appactivityresourcesstack8DC7672Anestedtemplatejsonservice6D174F83927DB388: {
				Arn: 'activity-function-service'
			},		
		})
	
		await stepFunctions.createStateMachine({
			definition: activityDefinitionString,
			name: 'activity-process-dynamodb-stream',
			roleArn: 'arn:aws:iam::000000000000:role/a-role'
		})
			.promise()


		/*
			JOURNAL
		*/
	
		if(tables.TableNames.includes('Journal')) {
			await deleteTable(dynamodb, 'Journal')
		}
		await createJournalTable(dynamodb)
	
		
	
		
	
		const journalPictureBucket = buckets.Buckets.find((item)=> item.Name == 'counterweight-journal-pictures-sandbox')
	
		if(journalPictureBucket != null) {
			let truncated = true
			let items: AWS.S3.ObjectList = []
			let continuationToken: undefined | string = undefined
			while(truncated) {
				const tempItems = await s3.listObjectsV2({
					Bucket: journalPictureBucket.Name,
					MaxKeys: 25,
					ContinuationToken: continuationToken
				}).promise()
	
				items = [
					...items,
					...tempItems.Contents
				]
	
				truncated = tempItems.IsTruncated
				continuationToken = tempItems.NextContinuationToken
			}
	
			const promises = items.map((item)=> s3.deleteObject({
				Bucket: journalPictureBucket.Name,
				Key: item.Key
			}).promise())
	
			await Promise.all(promises)
	
	
			await s3.deleteBucket({
				Bucket: journalPictureBucket.Name
			}).promise()
		}
	
		await s3.createBucket({
			Bucket: 'counterweight-journal-pictures-sandbox'
		}).promise()
		
		await addRoute({
			url: '/2015-03-31/functions/journal-function-service/invocations',
			lambda: path.join(__dirname, '../packages/journal-function-service/src/index.ts'),
			env: {
				AWS_REGION: 'eu-west-2',
				DYNAMODB_TABLE_NAME: 'Journal',
				JEST_WORKER_ID: '1',
				S3_BUCKET_NAME:  'counterweight-journal-pictures-sandbox',
				SERVICE_NAME: 'counterweight.journal',
				EVENT_BUS_NAME: 'conductor-bridge'
			}
		})

		
		
		
		//build process-dynamodb-streams
		const journalProcessDynamoDbStreams = stateMachines.stateMachines.find((item)=> item.name == 'journal-process-dynamodb-stream')
	
		if(journalProcessDynamoDbStreams != null) {
			const executions = await stepFunctions.listExecutions({
				stateMachineArn: journalProcessDynamoDbStreams.stateMachineArn,
				maxResults: 100
			}).promise()

			const activeExecutions = executions.executions.filter((item)=> item.status == 'RUNNING')

			if(activeExecutions.length > 0) {
				const promises = activeExecutions.map((item)=> stepFunctions.stopExecution({
					executionArn: item.executionArn
				}).promise())

				await Promise.all(promises)
			}

			const res = await stepFunctions.deleteStateMachine({
				stateMachineArn: journalProcessDynamoDbStreams.stateMachineArn
			}).promise()
			await waitPlease()
			
		}
	
		const journalSm = resourceList.stepFunctions.find((item)=> 
		{
			return TagManager.isTaggable(item) && 
			item.tags.tagValues()['service'] == 'journal' && 
			(item as CfnStateMachine).stateMachineName == 'journal-process-dynamodb-stream'
		})
		
		const journalSmDefintion = testAppStack.resolve(journalSm.definitionString)
		const journalSmDefintionString = buildCfnString(journalSmDefintion, {
			'AWS::Partition': '*',
			appjournalresourcesstack559D0DC0nestedtemplatejsonjournaltasks889DF7719F604B17: {
				Arn: 'journal-function-service'
			}
	
		})
	
		await stepFunctions.createStateMachine({
			definition: journalSmDefintionString,
			name: 'journal-process-dynamodb-stream',
			roleArn: 'arn:aws:iam::000000000000:role/a-role'
		})
			.promise()


		/*
			NOTIFICATION
		*/
		if(tables.TableNames.includes('Notification')) {
			await deleteTable(dynamodb, 'Notification')
		}
		
		await createNotificationTable(dynamodb)
		
	
	
		await addRoute({
			url: '/2015-03-31/functions/notification-function-service/invocations',
			lambda: path.join(__dirname, '../packages/notification-function-service/src/index.ts'),
			env: {
				AWS_REGION: 'eu-west-2',
				DYNAMODB_TABLE_NAME: 'Notification',
				JEST_WORKER_ID: '1',
				SERVICE_NAME: 'counterweight.notification',
				EVENT_BUS_NAME: 'conductor-bridge',
				PINPOINT_APPLICATION_ID: '123-123'
			}
		})
	
		//build process-dynamodb-streams
		const notificationProcessDynamoDbStreams = stateMachines.stateMachines.find((item)=> item.name == 'notification-process-dynamodb-stream')
	
		if(notificationProcessDynamoDbStreams != null) {
			const executions = await stepFunctions.listExecutions({
				stateMachineArn: notificationProcessDynamoDbStreams.stateMachineArn,
				maxResults: 100
			}).promise()

			const activeExecutions = executions.executions.filter((item)=> item.status == 'RUNNING')

			if(activeExecutions.length > 0) {
				const promises = activeExecutions.map((item)=> stepFunctions.stopExecution({
					executionArn: item.executionArn
				}).promise())

				await Promise.all(promises)
			}

			const res = await stepFunctions.deleteStateMachine({
				stateMachineArn: notificationProcessDynamoDbStreams.stateMachineArn
			}).promise()
			await waitPlease()
			
		}
	
		const notificationSm = resourceList.stepFunctions.find((item)=> 
		{
			return TagManager.isTaggable(item) && 
			item.tags.tagValues()['service'] == 'notification' && 
			(item as CfnStateMachine).stateMachineName == 'notification-process-dynamodb-stream'
		})
		
		const notificationDefintiion = testAppStack.resolve(notificationSm.definitionString)
		const notificationDefinitionString = buildCfnString(notificationDefintiion, {
			'AWS::Partition': '*',
			appnotificationresourcesstackC0EB6481nestedtemplatejsonservice6D174F83EFD6CFC2: {
				Arn: 'notification-function-service'
			},		
		})
	
		await stepFunctions.createStateMachine({
			definition: notificationDefinitionString,
			name: 'notification-process-dynamodb-stream',
			roleArn: 'arn:aws:iam::000000000000:role/a-role'
		})
			.promise()

		/*
			SUBSCRIPTION
		*/
		const stripeApiSecret = secrets.SecretList.find((item)=> item.Name == 'STRIPE_SECRET_API_KEY')
		let stripeApiSecretKey = ''

		if(stripeApiSecret != null) {
			const res1 = await secretsManager.restoreSecret({
				SecretId: stripeApiSecret.Name,
				
			}).promise()
			const res = await secretsManager.updateSecret({
				SecretId: res1.Name,
				SecretString: 'sk_test_vh7RWo2pJzBYiyHCnNU4bWNl00KlnYlEU9'
			}).promise()
			stripeApiSecretKey = res.Name
		}
		else {
			const res = await secretsManager.createSecret({
				Name: 'STRIPE_SECRET_API_KEY',
				SecretString: 'sk_test_vh7RWo2pJzBYiyHCnNU4bWNl00KlnYlEU9'
			}).promise()
			stripeApiSecretKey = res.Name
		}



		const stripeWebhookSecret = secrets.SecretList.find((item)=> item.Name == 'STRIPE_SECRET_WEBHOOK_KEY')
		
		let stripeWebhookSecretKey = ''
		if(stripeWebhookSecret != null) {
			const res1 = await secretsManager.restoreSecret({
				SecretId: stripeWebhookSecret.Name,
				
			}).promise()
			const res =await secretsManager.updateSecret({
				SecretId: res1.Name,
				SecretString: 'whsec_Jja0Vbp4evYrQDBy5KeJKqODbUVbjM7W'
			}).promise()

			stripeWebhookSecretKey = res.Name
			
		}
		else {
			const res = await secretsManager.createSecret({
				Name: 'STRIPE_SECRET_WEBHOOK_KEY',
				SecretString: 'whsec_Jja0Vbp4evYrQDBy5KeJKqODbUVbjM7W'
			}).promise()

			stripeWebhookSecretKey = res.Name
		}


		if(tables.TableNames.includes('Subscription')) {
			await deleteTable(dynamodb, 'Subscription')
		}
		await createSubscriptionTable(dynamodb)
		
		await addRoute({
			url: '/2015-03-31/functions/subscription-function-service/invocations',
			lambda: path.join(__dirname, '../packages/subscription-function-service/src/index.ts'),
			env: {
				AWS_REGION: 'eu-west-2',
				DYNAMODB_TABLE_NAME: 'Subscription',
				JEST_WORKER_ID: '1',
				SERVICE_NAME: 'counterweight.subscription',
				EVENT_BUS_NAME: 'conductor-bridge',
				SSM_STRIPE_API_SECRET_KEY: stripeApiSecretKey,
				SSM_STRIPE_WEBHOOK_SECRET_KEY: stripeWebhookSecretKey,
				STRIPE_API_KEY: 'pk_test_2RcGp1CSmdfs0ERu948Zr5H700L71SCM55'
			}
		})

		
		
		
		//build process-dynamodb-streams
		const subscriptionProcessDynamoDbStreams = stateMachines.stateMachines.find((item)=> item.name == 'subscription-process-dynamodb-stream')
	
		if(subscriptionProcessDynamoDbStreams != null) {
			const executions = await stepFunctions.listExecutions({
				stateMachineArn: subscriptionProcessDynamoDbStreams.stateMachineArn,
				maxResults: 100
			}).promise()

			const activeExecutions = executions.executions.filter((item)=> item.status == 'RUNNING')

			if(activeExecutions.length > 0) {
				const promises = activeExecutions.map((item)=> stepFunctions.stopExecution({
					executionArn: item.executionArn
				}).promise())

				await Promise.all(promises)
			}

			const res = await stepFunctions.deleteStateMachine({
				stateMachineArn: subscriptionProcessDynamoDbStreams.stateMachineArn
			}).promise()
			await waitPlease()
			
		}
	
		const subscriptionSm = resourceList.stepFunctions.find((item)=> 
		{
			return TagManager.isTaggable(item) && 
			item.tags.tagValues()['service'] == 'subscription' && 
			(item as CfnStateMachine).stateMachineName == 'subscription-process-dynamodb-stream'
		})
		
		const subscriptionSmDefintion = testAppStack.resolve(subscriptionSm.definitionString)
		const subscriptionSmDefintionString = buildCfnString(subscriptionSmDefintion, {
			'AWS::Partition': '*',
			appsubscriptionresourcesstack9F227ED4nestedtemplatejsonsubscriptiontasks470B8E2031015D62: {
				Arn: 'subscription-function-service'
			}
	
		})
	
		await stepFunctions.createStateMachine({
			definition: subscriptionSmDefintionString,
			name: 'subscription-process-dynamodb-stream',
			roleArn: 'arn:aws:iam::000000000000:role/a-role'
		})
			.promise()

		
		console.log('all resources created!!')
	}
	else {
		console.log('not running pretest setup, in CI')
		
	}

}

(async ()=> {
	await setup()
})()