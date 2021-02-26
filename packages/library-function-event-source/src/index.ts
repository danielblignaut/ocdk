export enum EventType {
	CLOUDFRONT,
	AWS_CONFIG,
	CODE_COMMIT,
	API_GATEWAY_AUTHORIZER,
	CLOUD_FORMATION,
	SES,
	API_GATEWAY_PROXY,
	SCHEDULED_EVENT,
	CLOUDWATCH_LOGS,
	SNS,
	DYNAMODB,
	KINESIS_FIREHOSE,
	COGNITO_SYNC_TRIGGER,
	KINESIS,
	S3,
	MOBILE_BACKEND,
	SQS,
	APPSYNC_RESOLVER,
	STEP_FUNCTION,
	LAMBDA_FUNCTION,
	EVENTBRIDGE
}

export function getLambdaEventSource(event: any): EventType {

	if (event.Records && event.Records[0].cf) return EventType.CLOUDFRONT

	if (event.configRuleId && event.configRuleName && event.configRuleArn) return EventType.AWS_CONFIG

	if (event.Records && (event.Records[0].eventSource === 'aws:codecommit')) return EventType.CODE_COMMIT

	if (event.authorizationToken === 'incoming-client-token') return EventType.API_GATEWAY_AUTHORIZER

	if (event.StackId && event.RequestType && event.ResourceType) return EventType.CLOUD_FORMATION

	if (event.Records && (event.Records[0].eventSource === 'aws:ses')) return EventType.SES

	if (event.headers && event.requestContext) return EventType.API_GATEWAY_PROXY

	if (event.source === 'aws.events') return EventType.SCHEDULED_EVENT

	if (event.awslogs && event.awslogs.data) return EventType.CLOUDWATCH_LOGS

	if (event.Records && (event.Records[0].EventSource === 'aws:sns')) return EventType.SNS

	if (event.Records && (event.Records[0].eventSource === 'aws:dynamodb')) return EventType.DYNAMODB

	if (event.records && event.records[0].approximateArrivalTimestamp) return EventType.KINESIS_FIREHOSE

	if (event.records && event.deliveryStreamArn && event.deliveryStreamArn.startsWith('arn:aws:kinesis:')) return EventType.KINESIS_FIREHOSE

	if (event.eventType === 'SyncTrigger' && event.identityId && event.identityPoolId) return EventType.COGNITO_SYNC_TRIGGER

	if (event.Records && event.Records[0].eventSource === 'aws:kinesis') return EventType.KINESIS

	if (event.Records && event.Records[0].eventSource === 'aws:s3') return EventType.S3

	if (event.operation && event.message) return EventType.MOBILE_BACKEND
    
	if (event.Records && (event.Records[0].eventSource === 'aws:sqs')) return EventType.SQS

	if(event.IS_APPSYNC) return EventType.APPSYNC_RESOLVER

	if(event.IS_STEP_FUNCTION) return EventType.STEP_FUNCTION

	if(event.IS_LAMBDA_FUNCTION) return EventType.LAMBDA_FUNCTION

	if(event['detail-type'] != null) return EventType.EVENTBRIDGE
}