import * as cdk from '@aws-cdk/core'
import * as sfn from '@aws-cdk/aws-stepfunctions'
import * as lambda from '@aws-cdk/aws-lambda'
import * as tasks from '@aws-cdk/aws-stepfunctions-tasks'
import * as iam from '@aws-cdk/aws-iam'
import { JsonPath, Result } from '@aws-cdk/aws-stepfunctions'
import { Construct } from '@aws-cdk/core'

export interface Options {
	scope: cdk.Construct
	stateMachineName: string

	publishToStreamFn: lambda.Function
	insertEventModelFn: lambda.Function
	prepareStreamStepFunctionArgsFn: lambda.Function


	policyStatements: iam.PolicyStatement[]
	serviceName: string
	models: string[]
}

export default function(options: Options) {
	const {
		scope,
		insertEventModelFn,
		publishToStreamFn,
		prepareStreamStepFunctionArgsFn,
		models,
		policyStatements,
		serviceName
	} = options

	if(options.hooks == null) {
		options.hooks = {}
	}

	if(options.hooks.Event == null) {
		options.hooks.Event = {}
	}

	const eventFragmentClose = (chain?: (scope: cdk.Construct)=> sfn.Chain)=> {


		return (scope: cdk.Construct)=> {
			const endChain = new sfn.Pass(scope, 'end-pass')
			const readIdentityToUserMappingPass = new sfn.Pass(scope, 'mapping-not-found')

			const publishChain = sfn.Chain.start(
				//NODE 1. Check if should publish event to stream 
				new sfn.Choice(scope, 'if-should-publish')
				.when(sfn.Condition.and(
					sfn.Condition.stringEquals('$.parameters.newModel.medium', 'EVENT_BRIDGE'),
					sfn.Condition.stringEquals('$.parameters.newModel.source', serviceName),
					sfn.Condition.or(
						sfn.Condition.isNotPresent('$.parameters.newModel.mediumId'),
						sfn.Condition.isNull('$.parameters.newModel.mediumId'),
						sfn.Condition.stringEquals('$.parameters.newModel.mediumId', ''),
					)
				),
					//NODE 1A.1 publish event to stream
					new tasks.LambdaInvoke(scope, 'publish-event', {
						//todo: change it
						lambdaFunction: options.insertEventModelFn,
						payload: {
							type: sfn.InputType.OBJECT,
							value: {
								action: 'event-model/publish',
								IS_STEP_FUNCTION: true,
								body: sfn.JsonPath.stringAt('$.parameters.newModel')
							},
							
						},
						resultPath: JsonPath.stringAt('$.publishEventResult')
					})
				)
				.otherwise(
					//NODE 1B.1 dont publish the event
					new sfn.Pass(scope, 'dont-publish-event')
				)
				.afterwards()
			)
			.next(
				//NODE 2. Check if we are dealing with an s3File event
				new sfn.Choice(scope, 'if-s3File-event')
				.when(
					sfn.Condition.and(
						sfn.Condition.stringEquals('$.parameters.typename', 'Event'),
						sfn.Condition.stringEquals('$.parameters.newModel.medium', 'S3'),
						sfn.Condition.stringEquals('$.parameters.newModel.source', serviceName),
					),
						
						//NODE 2A.1 Check if it is an insert or delete event
						new sfn.Choice(scope, 'created-or-deleted')
						.when(
							sfn.Condition.stringEquals('$.parameters.newModel.type', 's3File.created'),
							//NODE 2A.1A.1 construct first base parameters for create request
							new sfn.Pass(scope, 'create-file-request', {
								parameters: {
									bucketName: sfn.JsonPath.stringAt('$.parameters.newModel.data.object.bucketName'),
									filePath: sfn.JsonPath.stringAt('$.parameters.newModel.data.object.filePath'),
									size: sfn.JsonPath.numberAt('$.parameters.newModel.data.object.size'),
								},
								resultPath: '$.createFileRequest'
							})
							.next(
								//NODE 2A.1A.2 if no tags parameter is set, dont pass it on
								new sfn.Choice(scope, 'if-tags-set')
									.when(
										sfn.Condition.and(
											sfn.Condition.isPresent('$.parameters.newModel.data.object.tags'),
											sfn.Condition.isNotNull('$.parameters.newModel.data.object.tags')
										),
										//NODE 2A.1A.2A.1 pass on tags parameter
										new sfn.Pass(scope, 'tags-to-create-file-request', {
											inputPath: '$.parameters.newModel.data.object.tags',
											resultPath: '$.createFileRequest.tags'
										})
									)
									.otherwise(
										//NODE 2A.1A.2B.1
										new sfn.Pass(scope, 'tags-not-set')
									)
									.afterwards()
							)
							.next(
								//NODE 2A.1A.3 pass on metadata parameter
								new sfn.Choice(scope, 'if-metadata-set')
									.when(
										sfn.Condition.and(
											sfn.Condition.isPresent('$.parameters.newModel.data.object.metadata'),
											sfn.Condition.isNotNull('$.parameters.newModel.data.object.metadata')
										),
										//NODE 2A.1A.3A.1 pass on metadata parameter
										new sfn.Pass(scope, 'metadata-to-create-file-request', {
											inputPath: '$.parameters.newModel.data.object.metadata',
											resultPath: '$.createFileRequest.metadata'
										})
									)
									.otherwise(
										//NODE 2A.1A.3B.1 pass on metadata parameter
										new sfn.Pass(scope, 'metadata-not-set')
									)
									.afterwards()
							)
							.next(
								// NODE 2A.1A.4 check if cognitoIdentityId is set on the event... if so, we know there's a patient!
								new sfn.Choice(scope, 'is-identity-set')
									.when(
										sfn.Condition.and(
											sfn.Condition.isPresent('$.parameters.newModel.data.object.cognitoIdentityId'),
											sfn.Condition.not(sfn.Condition.stringEquals('$.parameters.newModel.data.object.cognitoIdentityId', ''))
										),
										//NODE 2A.1A.4A.1 construct read request to try get patient id
										new sfn.Pass(scope, 'set-read-mapping-param', {
											resultPath: '$.readUserIdentityMappingParameters',
											parameters:{
												['id.$']: `States.Format('IdentityToUserMapping-{}__IdentityToUserMapping-{}', $.parameters.newModel.data.object.cognitoIdentityId, $.parameters.newModel.data.object.cognitoIdentityId)`
											}
										})
										.next(
											//NODE 2A.1A.4A.2 execute read request to try get patient id
											new tasks.LambdaInvoke(scope, 'read-id-to-user-mapping', {
												//todo change
												lambdaFunction: options.publishToStreamFn,
												payload: {
													type: sfn.InputType.OBJECT,
													value: {
														action: 'identity-to-user-mapping/read',
														IS_STEP_FUNCTION: true,
														body: JsonPath.stringAt('$.readUserIdentityMappingParameters')
													},
													
												},
												resultPath: JsonPath.stringAt('$.readUserIdentityMappingResult'),
												
											})
											// .addCatch(readIdentityToUserMappingPass, {
											// 	errors: [
											// 		'could not find model'
											// 	]
											// })
										)
										.next(
											readIdentityToUserMappingPass
										)
										.next(
											//NODE 2A.1A.4A.3 check if we got a result from the read operation
											new sfn.Choice(scope, 'should-set-user-id')
												.when(
													sfn.Condition.and(
														sfn.Condition.isPresent('$.readUserIdentityMappingResult'),
														sfn.Condition.isNotNull('$.readUserIdentityMappingResult'),
														sfn.Condition.isPresent('$.readUserIdentityMappingResult.Payload'),
														sfn.Condition.isNotNull('$.readUserIdentityMappingResult.Payload'),
														sfn.Condition.isPresent('$.readUserIdentityMappingResult.Payload.userId'),
														sfn.Condition.isNotNull('$.readUserIdentityMappingResult.Payload.userId'),
														sfn.Condition.not(sfn.Condition.stringEquals('$.readUserIdentityMappingResult.Payload.userId', ''))
													),
													//NODE 2A.1A.4A.3A.1 we got a result so lets forward it to our created request
													new sfn.Pass(scope, 'set-user-id', {
														inputPath: '$.readUserIdentityMappingResult.Payload.userId',
														resultPath: '$.createFileRequest.userId'
													})
												)
												.otherwise(
													//NODE 2A.1A.4A.3B.1 no userId found to set
													new sfn.Pass(scope, 'no-userId-result')
												)
											.afterwards()
											
										)
									)
									.otherwise(
										//NODE 2A.1A.4B.1 no cognitoIdentityId set, dont try fetch userId
										new sfn.Pass(scope, 'no-cognito-iid')
									)
								.afterwards()
								.next(
									new tasks.LambdaInvoke(scope, 'create-file-model', {
										//todo change
										lambdaFunction: options.insertEventModelFn,
										payload: {
											type: sfn.InputType.OBJECT,
											value: {
												action: 'file/create',
												IS_STEP_FUNCTION: true,
												body: JsonPath.stringAt('$.createFileRequest')
											},
											
										},
										resultPath: JsonPath.stringAt('$.createFileResult')
									})
								)
							)
						)
						.when(
							sfn.Condition.stringEquals('$.parameters.newModel.type', 's3File.deleted'),
							//NODE 2A.1B construct our delete request parameters
							new sfn.Pass(scope, 'delete-file-request', {
								parameters: {
									['id.$']: `States.Format('File-{}#{}__File-{}#{}', $.parameters.newModel.data.previousAttributes.bucketName, $.parameters.newModel.data.previousAttributes.filePath, $.parameters.newModel.data.previousAttributes.bucketName, $.parameters.newModel.data.previousAttributes.filePath)`
								},
								resultPath: '$.deleteFileRequest'
							})
							.next(
								//NODE 2A.2B execute our deleted reqests
								new tasks.LambdaInvoke(scope, 'delete-file-model', {
									//todo: change
									lambdaFunction: options.insertEventModelFn,
									payload: {
										type: sfn.InputType.OBJECT,
										value: {
											action: 'file/delete',
											IS_STEP_FUNCTION: true,
											body: JsonPath.stringAt('$.deleteFileRequest')
										},
										
									},
									resultPath: JsonPath.stringAt('$.deleteFileResult')
								})
							)
						)
						.otherwise(
							//NODE 2A.1C we dont know this s3File event, leave it alone
							new sfn.Pass(scope, 'unknown-s3File-event')
						)
						.afterwards()
				)
				.otherwise(
					//NODE 2.1B not a file event
					new sfn.Pass(scope, 'not-s3File-event')
				)
				.afterwards()
				
			)
			.next(
				new sfn.Choice(scope, 'if-received-eventbridge-event')
					.when(
						sfn.Condition.and(
							sfn.Condition.stringEquals('$.parameters.newModel.medium', 'EVENT_BRIDGE'),
							sfn.Condition.not(sfn.Condition.stringEquals('$.parameters.newModel.source', options.serviceName))
						),
						new sfn.Choice(scope, 'if-identity-to-user-mapping-event')
							.when(
								sfn.Condition.and(
									sfn.Condition.stringEquals('$.parameters.newModel.type', 'IdentityToUserMapping.createRequest'),
									
								),
								new tasks.LambdaInvoke(scope, 'create-identity-to-user-mapping', {
									//todo: change
									lambdaFunction: options.insertEventModelFn,
									payload: {
										type: sfn.InputType.OBJECT,
										value: {
											action: 'identity-to-user-mapping/create',
											IS_STEP_FUNCTION: true,
											body: JsonPath.stringAt('$.parameters.newModel.data.object')
										},
										
									},
									resultPath: JsonPath.stringAt('$.createIdentityToUserMappingResult')
								})
							)
							.when(
								sfn.Condition.and(
									sfn.Condition.stringEquals('$.parameters.newModel.type', 'IdentityToUserMapping.deleteRequest'),
									sfn.Condition.not(sfn.Condition.stringEquals('$.parameters.newModel.source', options.serviceName))
								),
								new tasks.LambdaInvoke(scope, 'delete-identity-to-user-mapping', {
									//todo: change
									lambdaFunction: options.insertEventModelFn,
									payload: {
										type: sfn.InputType.OBJECT,
										value: {
											action: 'identity-to-user-mapping/delete',
											IS_STEP_FUNCTION: true,
											body: JsonPath.stringAt('$.parameters.newModel.data.object')
										},
										
									},
									resultPath: JsonPath.stringAt('$.deleteIdentityToUserMappingResult')
								})
							)
							.otherwise(
								new sfn.Pass(scope, 'not-identity-to-user-mapping-event')
							)
							.afterwards()
					)
					.otherwise(
						new sfn.Pass(scope, 'not-foreign-eventbridge-event')
					)
					.afterwards()
			)
			.next(endChain)
			
			if(chain != null) {
				const additional = chain(scope) 
				return publishChain
					.next(additional)
			}
			else {
				return publishChain
			} 
		}
		

	}

	if(options.hooks.Event.afterInsert == null) {
		options.hooks.Event.afterInsert = eventFragmentClose()
	}
	else {
		const temp = Object.assign({}, options.hooks.Event)
		options.hooks.Event.afterInsert = eventFragmentClose(options.hooks.Event.afterInsert)
	}

	const runSpecificModelWorkflow = new sfn.Choice(scope, 'run-specific-model-workflow', {})
		.otherwise(new sfn.Succeed(scope, 'dont-process-others', {}))

	models.forEach((modelTypename)=> {
		const typenameMatchesThisModel = sfn.Condition.stringEquals('$.parameters.typename', modelTypename)
		runSpecificModelWorkflow
			.when(typenameMatchesThisModel, new ManageModelPipeline(scope, modelTypename, {
				...options,
				hooks: (options.hooks != null && options.hooks[modelTypename] != null) ? options.hooks[modelTypename] : undefined
			}).prefixStates())
	})
	
	

	return 
	
}
