
import { S3} from 'aws-sdk'
import { TestType } from './jest'
import { S3Event, S3EventRecord, S3EventRecordGlacierEventData, S3EventRecordGlacierRestoreEventData } from 'aws-lambda'
import  {v4} from 'uuid'
import faker from 'faker'
import { getCredentials } from './aws'
export const s3 = async function(test: TestType) {

	let endpoint = 'http://localhost:4566'
	let s3ForcePathStyle = true

	if(process.env.CI === 'true') {
		test = TestType.REMOTE
	}

	switch(test) {
		case TestType.LOCAL: {
			break
		}
		case TestType.REMOTE: {
			endpoint = undefined
			s3ForcePathStyle = false
			break
		}
	}

	await getCredentials()

	const client = new S3({
		endpoint,
		region: 'eu-west-2',
		s3ForcePathStyle
	})



	return client
}

export const generateStream = (records: S3EventRecord[]): S3Event=> {
	return {  
		Records: [
			...records
		]
	}
}

type eventType = 'ObjectCreated:Put' | 'ObjectCreated:Post' | 'ObjectCreated:Copy' | 'ObjectCreated:CompleteMultipartUpload' | 'ObjectDeleted:Delete'

export const generateStreamRecord = (eventName: eventType, bucketName: string, objectKey: string, userIdentity?: string): S3EventRecord=> {
	return {  
		eventVersion:'2.2',
		eventSource:'aws:s3',
		awsRegion:'eu-west-2',
		eventTime: new Date().toISOString(),
		eventName,
		userIdentity:{  
			//@ts-ignore
			principalId: (userIdentity) ? userIdentity : v4() //'Amazon-customer-ID-of-the-user-who-caused-the-event'
		},
		requestParameters:{  
			sourceIPAddress: faker.internet.ip()
		},
		responseElements:{  
			//@ts-ignore
			'x-amz-request-id': v4(),
			//@ts-ignore
			'x-amz-id-2': v4(),
		},
		s3:{  
			s3SchemaVersion:'1.0',
			//@ts-ignore
			configurationId: v4(),
			bucket:{  
				name: bucketName,
				ownerIdentity:{  
					//@ts-ignore
					principalId: v4(),
				},
				arn: 'bucket-ARN'
			},
			object:{  
				key: objectKey,
				size: Math.round(Math.random() * 10000),
				eTag:'object eTag',
				versionId: '123',
				sequencer: 'aaa'
			}
		},
		glacierEventData: {
			restoreEventData: {
				lifecycleRestorationExpiryTime: new Date().toISOString(),
				lifecycleRestoreStorageClass: 'Source storage class for restore'
			}
		}
	}
}

export const deleteBucket = async (s3Client: S3, name: string)=> {
	const objects = await s3Client.listObjectsV2({
		Bucket: name
	})
		.promise()
	await s3Client.deleteObjects({
		Bucket: name,
		Delete: {
			Objects: objects.Contents.map((object)=> ({
				Key: object.Key
			}))
		}
	})
		.promise()

	await s3Client.deleteBucket({
		Bucket: name
	})
		.promise()
}