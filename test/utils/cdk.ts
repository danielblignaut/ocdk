import 'reflect-metadata'
import { AppStack } from '../../packages/app/lib/app/stack'
import * as cdk from '@aws-cdk/core'
import * as cognito from '@aws-cdk/aws-cognito'
import { Aspects, CfnResource, Construct, IAspect, IConstruct, Stack, StackProps, TagManager } from '@aws-cdk/core'
import * as appsync from '@aws-cdk/aws-appsync'
import * as dynamodb from '@aws-cdk/aws-dynamodb'
import * as stepFunction from '@aws-cdk/aws-stepfunctions'
import * as s3 from '@aws-cdk/aws-s3'
import * as apig from '@aws-cdk/aws-apigateway'
import {SynthUtils} from '@aws-cdk/assert'
import fs from 'fs'
import path from 'path'
import * as cfnInclude from '@aws-cdk/cloudformation-include'
import * as sm from '@aws-cdk/aws-secretsmanager'

export class ResourceLister implements IAspect {
	public userPools: cognito.CfnUserPool[] = []
	public userPoolClients: cognito.CfnUserPoolClient[] = []
	public identityPools: cognito.CfnIdentityPool[] = []
	public graphqlApis: appsync.CfnGraphQLApi[] = []
	public dynamodbTables: dynamodb.CfnTable[] = []
	public stepFunctions: stepFunction.CfnStateMachine[] = []
	public s3Buckets: s3.CfnBucket[] = []
	public apiGateways: apig.CfnRestApi[] = []
	public loaded = false
	public secrets: sm.CfnSecret[] = []


	public visit(node: IConstruct): void {
		// See that we're dealing with a CfnBucket

		if (node instanceof cognito.CfnUserPool) {
			this.userPools.push(node)
		}
		else if(node instanceof cognito.CfnUserPoolClient) {
			this.userPoolClients.push(node)
		}
		else if(node instanceof cognito.CfnIdentityPool) {
			this.identityPools.push(node)
		}
		else if(node instanceof appsync.CfnGraphQLApi) {
			this.graphqlApis.push(node)
		}
		else if(node instanceof dynamodb.CfnTable) {
			this.dynamodbTables.push(node)
		}
		else if(node instanceof stepFunction.CfnStateMachine) {
			this.stepFunctions.push(node)
		}
		else if(node instanceof s3.CfnBucket) {
			this.s3Buckets.push(node)
		}
		else if(node instanceof apig.CfnRestApi) {
			this.apiGateways.push(node)
		}
		else if(node instanceof sm.CfnSecret) {
			this.secrets.push(node)
		}
	}
}

export const testCdkApp = new cdk.App()
export const resourceList = new ResourceLister()


const CLOUD_ASSEMBLY_FILE_PATH = path.join(__dirname, 'test-cloud-assembly.json')
let CDK_CACHED = false
class TestStack extends Stack {
	constructor(scope: Construct, id: string, props?: StackProps) {
		super(scope, id, props) 

		Aspects.of(this)
			.add(resourceList)
		
		const cloudAssemblyString = fs.readFileSync(CLOUD_ASSEMBLY_FILE_PATH, {encoding:'utf8', flag:'r'})
		const cloudAssembly = JSON.parse(cloudAssemblyString)

		const buildDirectory = cloudAssembly.assembly.directory
		const filesNames = fs.readdirSync(buildDirectory)
		

		filesNames.forEach((fileName)=> {
			const filePath = path.join(buildDirectory, fileName)
			
			if(filePath.includes('.template.json')) {

				new cfnInclude.CfnInclude(this, fileName, {
					templateFile: filePath,
					// loadNestedStacks: nestedStacks[parentStack],
					preserveLogicalIds: false
				})
			}
		
		})
			
		
		
	}
}

export let testAppStack: TestStack | null = null

export function synth() {
	try {
		if(testAppStack == null) {
			if(fs.existsSync(CLOUD_ASSEMBLY_FILE_PATH)) { 
				CDK_CACHED = true
			}
			else {
				CDK_CACHED = false

				console.log('NOT CACHED, BUILDING')
				const freshCdkApp = new cdk.App()
				const CDK_FRESH_APP_STACK = new AppStack(freshCdkApp, 'app', {
					stage: (process.env.STAGE != null) ? process.env.STAGE : 'sandbox'
				})

				const res = freshCdkApp.synth()

				const cloudAssemblyArtifact = res.getStackArtifact(CDK_FRESH_APP_STACK.artifactId)
				//TODO: have to remove circular dependencies
				fs.writeFileSync(CLOUD_ASSEMBLY_FILE_PATH, JSON.stringify({
					
					assembly: {
						directory: cloudAssemblyArtifact.assembly.directory
					}
					
				}))
			}

			testAppStack = new TestStack(testCdkApp, 'app')
			testCdkApp.synth()
		}
		
	}
	catch(err) {
		console.error(err)
	}

	return getResourceList()
}

export async function getResourceList(): Promise<ResourceLister> {

	function checker() {
		if(resourceList.userPools.length >= 1 && 
			resourceList.userPoolClients.length >= 2 && 
			resourceList.identityPools.length >= 1 && 
			resourceList.graphqlApis.length >= 7 &&
			resourceList.dynamodbTables.length >= 7 && 
			resourceList.stepFunctions.length >= 9 && 
			resourceList.apiGateways.length >= 1 &&
			resourceList.secrets.length >= 2) {
			

			return true
		}

		return false
	}

	if(checker()) {
		resourceList.loaded = true
		return Promise.resolve(resourceList)
	}
	else {
		return new Promise<ResourceLister>((resolve)=> {
			let innerTimer = null
			const timer = setTimeout(function check() {
				if(checker()) {
					clearTimeout(timer)
					clearTimeout(innerTimer)
					resourceList.loaded = true
					return resolve(resourceList)					
				}
				else {
					innerTimer = setTimeout(check, 20)
				}
			}, 500)
		})
	}
}


export function findConstructInService<T extends Construct>(serviceName: string, constructArray: T[]): T {
	const item = constructArray.find((t: Construct)=> {
		if(TagManager.isTaggable(t)) {
			const m = t.tags as TagManager
			const values = m.tagValues()
			if(values.service != null) {
				if(values.service == serviceName) {
					return true
				}
			}
		}

		return false
	})

	return item
}