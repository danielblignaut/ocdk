import AWS, { CognitoIdentityServiceProvider, DynamoDB, EventBridge, Kinesis, SecretsManager, StepFunctions } from 'aws-sdk'
import { configureAws } from './utils/aws'
import { getResourceList, synth } from './utils/cdk'
import { deleteTable } from './utils/dynamodb'
import { deleteStream } from './utils/kinesis'

async function teardown() {
	console.log('running post-jest setup')
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
	await configureAws()
	synth()
	const resourceList = await getResourceList()
	
	if(process.env.CI === 'false') {
		console.log('running pre-jest teardown not in CI')
		if(process.env.CI === 'false') {
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
			const kinesis = new Kinesis({
				endpoint,
				region
			})
			const cognito = new CognitoIdentityServiceProvider({
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

			await eventBridge.deleteEventBus({
				Name: 'conductor-bridge'
			}).promise()

			const tables = await dynamodb.listTables({
				Limit: 25
			}).promise()
			const stateMachines = await stepFunctions.listStateMachines({
				maxResults: 25
			}).promise()

			
			const userpools = await cognito.listUserPools({
				MaxResults: 25
			}).promise()
			const buckets = await s3.listBuckets().promise()

			/*
				USER
			*/

			if(tables.TableNames.includes('User')) {
				await deleteTable(dynamodb, 'User')
			}

			


			const pool = userpools.UserPools.find((item)=> item.Name == 'user-userpool')

			if(pool != null) {
				await cognito.deleteUserPool({
					UserPoolId: pool.Id
				}).promise()
			}

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
			
			const userSm = stateMachines.stateMachines.find(item => item.name.includes('user-process-dynamodb-stream'))
			
			if(userSm != null) {
				const executions = await stepFunctions.listExecutions({
					stateMachineArn: userSm.stateMachineArn,
					maxResults: 100
				}).promise()

				const activeExecutions = executions.executions.filter((item)=> item.status == 'RUNNING')

				if(activeExecutions.length > 0) {
					const promises = activeExecutions.map((item)=> stepFunctions.stopExecution({
						executionArn: item.executionArn
					}).promise())

					await Promise.all(promises)
				}


				await stepFunctions.deleteStateMachine({
					stateMachineArn: userSm.stateMachineArn
				}).promise()
			}

			const attributeSm = stateMachines.stateMachines.find(item => item.name.includes('user-delete-unverified-attributes'))
			
			if(attributeSm != null) {

				const executions = await stepFunctions.listExecutions({
					stateMachineArn: attributeSm.stateMachineArn,
					maxResults: 100
				}).promise()

				const activeExecutions = executions.executions.filter((item)=> item.status == 'RUNNING')

				if(activeExecutions.length > 0) {
					const promises = activeExecutions.map((item)=> stepFunctions.stopExecution({
						executionArn: item.executionArn
					}).promise())

					await Promise.all(promises)
				}


				await stepFunctions.deleteStateMachine({
					stateMachineArn: attributeSm.stateMachineArn
				}).promise()
			}

			const userS3Sm = stateMachines.stateMachines.find(item => item.name.includes('user-process-s3-bucket-streams'))
			
			if(userS3Sm != null) {
				const executions = await stepFunctions.listExecutions({
					stateMachineArn: userS3Sm.stateMachineArn,
					maxResults: 100
				}).promise()

				const activeExecutions = executions.executions.filter((item)=> item.status == 'RUNNING')

				if(activeExecutions.length > 0) {
					const promises = activeExecutions.map((item)=> stepFunctions.stopExecution({
						executionArn: item.executionArn
					}).promise())

					await Promise.all(promises)
				}


				await stepFunctions.deleteStateMachine({
					stateMachineArn: userS3Sm.stateMachineArn
				}).promise()
			}

			/*
				NOTE
			*/
			if(tables.TableNames.includes('Note')) {
				await deleteTable(dynamodb, 'Note')
			}


		

			const noteSm = stateMachines.stateMachines.find(item => item.name.includes('note'))
			
			if(noteSm != null) {
				const executions = await stepFunctions.listExecutions({
					stateMachineArn: noteSm.stateMachineArn,
					maxResults: 100
				}).promise()

				const activeExecutions = executions.executions.filter((item)=> item.status == 'RUNNING')

				if(activeExecutions.length > 0) {
					const promises = activeExecutions.map((item)=> stepFunctions.stopExecution({
						executionArn: item.executionArn
					}).promise())

					await Promise.all(promises)
				}


				await stepFunctions.deleteStateMachine({
					stateMachineArn: noteSm.stateMachineArn
				}).promise()
			}


			/*
				MEASUREMENT
			*/
			if(tables.TableNames.includes('Measurement')) {
				await deleteTable(dynamodb, 'Measurement')
			}
			
			
			
			const measurementSm = stateMachines.stateMachines.find(item => item.name.includes('measurement'))
			
			if(measurementSm != null) {
				const executions = await stepFunctions.listExecutions({
					stateMachineArn: measurementSm.stateMachineArn,
					maxResults: 100
				}).promise()

				const activeExecutions = executions.executions.filter((item)=> item.status == 'RUNNING')

				if(activeExecutions.length > 0) {
					const promises = activeExecutions.map((item)=> stepFunctions.stopExecution({
						executionArn: item.executionArn
					}).promise())

					await Promise.all(promises)
				}


				await stepFunctions.deleteStateMachine({
					stateMachineArn: measurementSm.stateMachineArn
				}).promise()
			}

			/*
				CMS
			*/
			await secretsManager.deleteSecret({
				SecretId: 'SANITY_SECRET_API_KEY'
			}).promise()

			await secretsManager.deleteSecret({
				SecretId: 'SANITY_SECRET_WEBHOOK_KEY'
			}).promise()

			if(tables.TableNames.includes('CMS')) {
				await deleteTable(dynamodb, 'CMS')
			}
			
			

			const cmsSm = stateMachines.stateMachines.find(item => item.name.includes('cms'))
			
			if(cmsSm != null) {
				const executions = await stepFunctions.listExecutions({
					stateMachineArn: cmsSm.stateMachineArn,
					maxResults: 100
				}).promise()

				const activeExecutions = executions.executions.filter((item)=> item.status == 'RUNNING')

				if(activeExecutions.length > 0) {
					const promises = activeExecutions.map((item)=> stepFunctions.stopExecution({
						executionArn: item.executionArn
					}).promise())

					await Promise.all(promises)
				}

				await stepFunctions.deleteStateMachine({
					stateMachineArn: cmsSm.stateMachineArn
				}).promise()
			}

			/*
				GOAL
			*/
			if(tables.TableNames.includes('Goal')) {
				await deleteTable(dynamodb, 'Goal')
			}


			const goalSm = stateMachines.stateMachines.find(item => item.name.includes('goal'))
			
			if(goalSm != null) {
				const executions = await stepFunctions.listExecutions({
					stateMachineArn: goalSm.stateMachineArn,
					maxResults: 100
				}).promise()

				const activeExecutions = executions.executions.filter((item)=> item.status == 'RUNNING')

				if(activeExecutions.length > 0) {
					const promises = activeExecutions.map((item)=> stepFunctions.stopExecution({
						executionArn: item.executionArn
					}).promise())

					await Promise.all(promises)
				}


				await stepFunctions.deleteStateMachine({
					stateMachineArn: goalSm.stateMachineArn
				}).promise()
			}

			/*
				ACTIVITY
			*/
			if(tables.TableNames.includes('Activity')) {
				await deleteTable(dynamodb, 'Activity')
			}


			const activitySm = stateMachines.stateMachines.find(item => item.name.includes('activity'))
			
			if(activitySm != null) {
				const executions = await stepFunctions.listExecutions({
					stateMachineArn: activitySm.stateMachineArn,
					maxResults: 100
				}).promise()

				const activeExecutions = executions.executions.filter((item)=> item.status == 'RUNNING')

				if(activeExecutions.length > 0) {
					const promises = activeExecutions.map((item)=> stepFunctions.stopExecution({
						executionArn: item.executionArn
					}).promise())

					await Promise.all(promises)
				}


				await stepFunctions.deleteStateMachine({
					stateMachineArn: activitySm.stateMachineArn
				}).promise()
			}

			/*
				Journal
			*/

			if(tables.TableNames.includes('Journal')) {
				await deleteTable(dynamodb, 'Journal')
			}

		
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
			
			const journalSm = stateMachines.stateMachines.find(item => item.name.includes('journal-process-dynamodb-stream'))
			
			if(journalSm != null) {
				const executions = await stepFunctions.listExecutions({
					stateMachineArn: journalSm.stateMachineArn,
					maxResults: 100
				}).promise()

				const activeExecutions = executions.executions.filter((item)=> item.status == 'RUNNING')

				if(activeExecutions.length > 0) {
					const promises = activeExecutions.map((item)=> stepFunctions.stopExecution({
						executionArn: item.executionArn
					}).promise())

					await Promise.all(promises)
				}


				await stepFunctions.deleteStateMachine({
					stateMachineArn: journalSm.stateMachineArn
				}).promise()
			}

			
			const journalS3Sm = stateMachines.stateMachines.find(item => item.name.includes('journal-process-s3-bucket-streams'))
			
			if(journalS3Sm != null) {
				const executions = await stepFunctions.listExecutions({
					stateMachineArn: journalS3Sm.stateMachineArn,
					maxResults: 100
				}).promise()

				const activeExecutions = executions.executions.filter((item)=> item.status == 'RUNNING')

				if(activeExecutions.length > 0) {
					const promises = activeExecutions.map((item)=> stepFunctions.stopExecution({
						executionArn: item.executionArn
					}).promise())

					await Promise.all(promises)
				}


				await stepFunctions.deleteStateMachine({
					stateMachineArn: journalS3Sm.stateMachineArn
				}).promise()
			}


			/*
				NOTIFICATION
			*/
			if(tables.TableNames.includes('Notification')) {
				await deleteTable(dynamodb, 'Notification')
			}
			
		

			const notificationSm = stateMachines.stateMachines.find(item => item.name.includes('notification'))
			
			if(notificationSm != null) {
				const executions = await stepFunctions.listExecutions({
					stateMachineArn: notificationSm.stateMachineArn,
					maxResults: 100
				}).promise()

				const activeExecutions = executions.executions.filter((item)=> item.status == 'RUNNING')

				if(activeExecutions.length > 0) {
					const promises = activeExecutions.map((item)=> stepFunctions.stopExecution({
						executionArn: item.executionArn
					}).promise())

					await Promise.all(promises)
				}


				await stepFunctions.deleteStateMachine({
					stateMachineArn: notificationSm.stateMachineArn
				}).promise()
			}

			/*
				Subscription
			*/
			await secretsManager.deleteSecret({
				SecretId: 'STRIPE_SECRET_API_KEY'
			}).promise()

			await secretsManager.deleteSecret({
				SecretId: 'STRIPE_SECRET_WEBHOOK_KEY'
			}).promise()

			if(tables.TableNames.includes('Subscription')) {
				await deleteTable(dynamodb, 'Subscription')
			}

			
			const subscriptionSm = stateMachines.stateMachines.find(item => item.name.includes('subscription-process-dynamodb-stream'))
			
			if(subscriptionSm != null) {
				const executions = await stepFunctions.listExecutions({
					stateMachineArn: subscriptionSm.stateMachineArn,
					maxResults: 100
				}).promise()

				const activeExecutions = executions.executions.filter((item)=> item.status == 'RUNNING')

				if(activeExecutions.length > 0) {
					const promises = activeExecutions.map((item)=> stepFunctions.stopExecution({
						executionArn: item.executionArn
					}).promise())

					await Promise.all(promises)
				}


				await stepFunctions.deleteStateMachine({
					stateMachineArn: subscriptionSm.stateMachineArn
				}).promise()
			}
			
		}
		
	}
	else {
		console.log('not running posttest teardown, in CI')
		console.log('but we will update user pool client to remove admin login functionality')
		
	}
}

(async ()=> {
	await teardown()
	require('./post-test.js')
})()