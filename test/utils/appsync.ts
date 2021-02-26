import Appsync from 'aws-sdk/clients/appsync'
import { TestType } from './jest'
import { ApolloClient, from, HttpLink, InMemoryCache, ApolloLink, } from '@apollo/client/core'
import { setContext } from '@apollo/client/link/context'
import {getCredentials} from './aws'
import {sign} from 'aws4'
import fetch from 'cross-fetch'
import { print } from 'graphql/language/printer'
import { ci, cisp, createConfirmedUser, innerSignInUser, signInUser, SignInUserResponse } from './cognito'
import { CfnUserPoolClient, CfnUserPool } from '@aws-cdk/aws-cognito'
import faker from 'faker'
import path from 'path'
import fs from 'fs'
import { getResourceList } from './cdk'
import generatePatient from './user/generate-patient'
import { ddb } from './dynamodb'

const asyncTimeout = ()=> {
	return new Promise<void>((resolve)=> {
		setTimeout(()=> { 
			resolve()
		}, 300)
	})
}

export const as = async (test: TestType)=> {
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

	return new Appsync({
		endpoint,
		region: 'eu-west-2'
	})
} 

const TEMP_CREDS_PATH = path.join(__dirname, 'test-api-aws-credentials.json')

export const createApiTestUser = async ()=> {
	if(!fs.existsSync(TEMP_CREDS_PATH)) {
		const cognito = await cisp(TestType.REMOTE)
		const identity = await ci(TestType.REMOTE)
		const documentClient = await ddb(TestType.REMOTE)
		const resourceList = await getResourceList()

		const pools = await cognito.listUserPools({
			MaxResults: 10
		})
			.promise()
		const userPool = pools.UserPools.find((item)=> item.Name == resourceList.userPools[0].userPoolName)
		const idPools = await identity.listIdentityPools({
			MaxResults: 10
		})
			.promise()

		const identityPool = idPools.IdentityPools.find((item)=> item.IdentityPoolName == resourceList.identityPools[0].identityPoolName)
		const clients = await cognito.listUserPoolClients({
			MaxResults: 10,
			UserPoolId: userPool.Id
		})
			.promise()

		const resourceListClient = resourceList.userPoolClients.find((item)=> item.clientName == 'test-client')
		const userPoolClientShort = clients.UserPoolClients.find((item)=> item.ClientName == resourceListClient.clientName)
		const client = await cognito.describeUserPoolClient({
			ClientId: userPoolClientShort.ClientId,
			UserPoolId: userPool.Id
		})
			.promise()

		const email = faker.internet.email()
		const patient = generatePatient()
		const password =  'Password1234!'

		
		const testUser = await createConfirmedUser({
			cognito,
			userPoolId: userPool.Id,
			username: email,
			password,
			email,
			phone: faker.phone.phoneNumber('+44773#######'),
			patientId: `${patient.pk}__${patient.sk}`
		})

		patient.cognitoUserConfirmed = true
		patient.cognitoUsername = testUser.Username
		await documentClient.put({
			TableName: 'Users',
			Item: patient
		}).promise()


		const testApiUser = await signInUser({
			identityPoolId: identityPool.IdentityPoolId,
			userPoolClientId: client.UserPoolClient.ClientId,
			userPoolId: userPool.Id,
			username: email,
			password,
			cognito
		})

		fs.writeFileSync(TEMP_CREDS_PATH, JSON.stringify({
			userPoolClientId: testApiUser.userPoolClientId,
			userPoolId: testApiUser.userPoolId,
			username: testApiUser.username,
			cognito,
			identityPoolId: testApiUser.identityPoolId,
			refreshToken: testApiUser.refreshToken,
			accessToken: testApiUser.accessToken,
			idToken: testApiUser.idToken
		}))

		return testApiUser
	}
	else {
		const credString = fs.readFileSync(TEMP_CREDS_PATH, { encoding: 'utf8' })
		const creds = JSON.parse(credString)
		const signInUser = await innerSignInUser(creds)
		return signInUser
	}
	

}

export const withCognitoAuthLink = ()=> {
	const authenticationLink = setContext(async (_, { headers }) => {
		const user = await createApiTestUser()
		const token = user.session.getIdToken().getJwtToken()


		return {
			headers: {
				...headers,
				Authorization: token
			}
		}
	})

	return authenticationLink
}

export const withV4SignatureIamAuthLink = (uri: string)=> {
	const authLink = new ApolloLink((operation, forward)=> {
		const { signature } = operation.getContext()
		operation.setContext(() => ({
			headers: signature.headers
		}))

		return forward(operation)

	})

	return authLink
}

export const withV4Signature = (uri: string)=> {
	return setContext(async (operation) => {
		const query = print(operation.query)
		
		const body = {
			operationName: operation.operationName,
			variables: operation.variables,
			query,
		}
	
		const options = {
			service: 'appsync',
			region: 'eu-west-2',
			body: JSON.stringify(body),
			path: '/graphql',
			method: 'POST',
			host: uri
				.replace('https://', '')
				.replace('/graphql', ''),
			
		}
	
	
		const creds = await getCredentials()

	
		const signature = sign(options, {
			accessKeyId: creds.accessKeyId,
			secretAccessKey: creds.secretAccessKey,
			sessionToken: creds.sessionToken
		})
	
		return {
			signature
		}
	
	})
}

export const apollo = (uri: string, links: ApolloLink[] = [])=> {
	const httpLink = new HttpLink({
		uri, 
		credentials: 'same-origin', 
		// fetch
		fetch: (info, init)=> {
			delete init.headers['accept']
			delete init.headers['content-type']
			return fetch(info, init)
		},
	})


	links.push(httpLink)

	

	return new ApolloClient({
		link: from(links),
		cache: new InMemoryCache({ }),
		
		defaultOptions: {
			watchQuery: {
				fetchPolicy: 'no-cache',
				errorPolicy: 'ignore',
			},
			query: {
				fetchPolicy: 'no-cache',
				errorPolicy: 'all',
			},
			mutate: {
				fetchPolicy: 'no-cache',
				errorPolicy: 'all',
			},
		}
	})
}
