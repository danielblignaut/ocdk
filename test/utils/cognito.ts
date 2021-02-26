import {
	CognitoUserPool,
	CognitoUserAttribute,
	CognitoUser,
	CognitoUserSession,
	CognitoAccessToken,
	CognitoIdToken,
	CognitoRefreshToken
} from 'amazon-cognito-identity-js'
import AWS, { CognitoIdentity, CognitoIdentityCredentials, CognitoIdentityServiceProvider } from 'aws-sdk'
import { CredentialsOptions } from 'aws-sdk/lib/credentials'
import { TestType } from './jest'
import { getCredentials } from './aws'
import { PromiseResult } from 'aws-sdk/lib/request'
import { StringUrlWithLength } from 'aws-sdk/clients/lexruntime'
import uuid from '@mocks/uuid'

export const ci = async function(test: TestType) {
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

	return new CognitoIdentity({
		endpoint: endpoint,
		region: 'eu-west-2'
	})
}

export const cisp = async function(test: TestType) {

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

	const t =  new CognitoIdentityServiceProvider({
		endpoint: endpoint,
		region: 'eu-west-2',
		// credentials
	})

	return t


}

export const emptyUserPool = async (cognito: CognitoIdentityServiceProvider, userPoolId: string)=> {

	const repeatDeleteUsers = (batches: CognitoIdentityServiceProvider.UsersListType[], userList: CognitoIdentityServiceProvider.UsersListType, initialRun: boolean)=> {
		if(!initialRun && batches.length == 0) return Promise.resolve()

		if(initialRun && batches.length == 0) {
			const chunk = 10
			for (let i=0; i< userList.length -1; i+=chunk) {
				const temparray = userList.slice(i,i+chunk)
				batches.push(temparray)
			}
		}

		let currentBatch = batches.pop()

		if(currentBatch == null) currentBatch = []

		const promises = currentBatch.map((user)=> 
			cognito.adminDeleteUser({
				UserPoolId: userPoolId,
				Username: user.Username,
			})
				.promise()
		)

		return Promise.all(promises)
			.then((res)=> {
				return new Promise<{
					$response: AWS.Response<{}, AWS.AWSError>
				}[]>((resolve, reject)=> {
					setTimeout(()=> {
						return resolve(res)
					}, 1000)
				})
			})
			.then((res)=> {
				const apiRes = res[0] as PromiseResult<CognitoIdentityServiceProvider.ListUsersResponse, AWS.AWSError>
				return repeatDeleteUsers(batches, userList, false)
			})
	}

	const repeatListUsers = (userList: CognitoIdentityServiceProvider.UsersListType, initialRun: boolean, paginationToken?: string )=> {
		if(!initialRun && paginationToken == null) return Promise.resolve(userList)

		return cognito.listUsers({
			UserPoolId: userPoolId,
			Limit: 60,
			PaginationToken: paginationToken
		})
			.promise()
			.then((res)=> {
				userList = [...userList, ...res.Users]

				return repeatListUsers(userList, false, res.PaginationToken)
			})
	}
	repeatListUsers([], true)
		.then((res)=> repeatDeleteUsers([], res, true))


}

interface ConfirmedUserOptions {
	password: string
	username: string
	dietitianId?: string
	patientId?: string
	cognito: CognitoIdentityServiceProvider
	email: string
	phone: string
	userPoolId: string
	emailVerified?: boolean
}

export async function createConfirmedUser(options: ConfirmedUserOptions) {
	const {
		cognito,
		username,
		password,
		dietitianId,
		patientId,
		email,
		phone,
		userPoolId,
		emailVerified
	} = options
	
	
	const attributes = [
		
	]

	if(dietitianId != null) {
		
		attributes.push({
			Name: 'custom:dietitian_id',
			Value: dietitianId
		})
		
	}

	if(patientId != null) {
		
		attributes.push({
			Name: 'custom:patient_id',
			Value: patientId
		})
		
	}

	if(phone != null) {
		
		attributes.push({
			Name: 'phone_number',
			Value: phone
		})

		
		
	}

	if(email != null) {
		
		attributes.push({
			Name: 'email',
			Value: email
		})

		
		
	}

	if(emailVerified) {
		attributes.push({
			Name: 'email_verified',
			Value: 'true'
		})
	}

	const res = await cognito.adminCreateUser({
		UserPoolId: userPoolId,
		Username: username,
		MessageAction: 'SUPPRESS',
		UserAttributes: attributes
	})
		.promise()

	const user = res.User

	await cognito.adminSetUserPassword({
		Password: password,
		Permanent: true,
		UserPoolId: userPoolId,
		Username: user.Username
	})
		.promise()

	return user

}


interface SignInUserOptions {

	cognito: CognitoIdentityServiceProvider

	userPoolId: string
	userPoolClientId: string
	username: string
	password: string
	identityPoolId: string
}

export interface SignInUserResponse {
	credentials: CognitoIdentityCredentials
	session: CognitoUserSession
	user: CognitoUser
	userPoolId: string
	username: string
	refreshToken: string
	idToken: string
	accessToken: string
	identityPoolId: string
	userPoolClientId: string
}

export async function signInUser(options: SignInUserOptions): Promise<SignInUserResponse> {

	const {
		userPoolClientId,
		userPoolId,
		username,
		password,
		cognito,
		identityPoolId
	} = options

	const loginRes = await cognito.adminInitiateAuth({
		UserPoolId: userPoolId,
		AuthFlow: 'ADMIN_USER_PASSWORD_AUTH',
		ClientId: userPoolClientId,
		AuthParameters: {
			USERNAME: username,
			PASSWORD: password,
		}
	})
		.promise()

	return {
		...innerSignInUser({
			userPoolClientId,
			userPoolId,
			username,
			cognito,
			identityPoolId,
			refreshToken: loginRes.AuthenticationResult.RefreshToken,
			accessToken: loginRes.AuthenticationResult.AccessToken,
			idToken: loginRes.AuthenticationResult.IdToken
		}),
		...{
			userPoolClientId,
			userPoolId,
			username,
			cognito,
			identityPoolId,
			refreshToken: loginRes.AuthenticationResult.RefreshToken,
			accessToken: loginRes.AuthenticationResult.AccessToken,
			idToken: loginRes.AuthenticationResult.IdToken
		}
	}
}

interface InnerSignInUserOptions {
	userPoolId: string
	cognito: CognitoIdentityServiceProvider
	username: string
	refreshToken: string
	idToken: string
	accessToken: string
	identityPoolId: string
	userPoolClientId: string
}

export function innerSignInUser(options: InnerSignInUserOptions) {
	const {
		userPoolId,
		cognito,
		username,
		refreshToken,
		accessToken,
		idToken,
		identityPoolId,
		userPoolClientId
	} = options


	const clientUserPool = new CognitoUserPool({
		UserPoolId: userPoolId,
		ClientId: userPoolClientId,
		endpoint: cognito.config.endpoint
	})
	
	const cognitoUser = new CognitoUser({
		Username: username,
		Pool: clientUserPool,
	})

	const refreshTokenObject  = new CognitoRefreshToken({
		RefreshToken: refreshToken
	})
	const userSession = new CognitoUserSession({
		IdToken: new CognitoIdToken({
			IdToken: idToken
		}),
		AccessToken: new CognitoAccessToken({
			AccessToken: accessToken
		}),
		RefreshToken: refreshTokenObject,
	})

	cognitoUser.setSignInUserSession(userSession)
	let innerTimer = null
	const timer = setTimeout(async function check() {
		try {
			await new Promise<void>((resolve, reject)=> {
				cognitoUser.refreshSession(refreshTokenObject, (err, res)=> {
					if(err) {
						return reject(err)
					}
					clearTimeout(innerTimer)
					clearTimeout(timer)
					return resolve()
				})
			})
		}
		catch(e) {
			innerTimer = setTimeout(check, 500)
		}
	}, 500)

	let url = 'cognito-idp.eu-west-2.amazonaws.com'
	let settings = {}

	if(cognito.config.endpoint.includes('localhost')) {
		url = 'http://localhost:4566'
		settings = {
			//@ts-ignore
			endpoint: cognito.config.endpoint
		}
	}


	const credentials = new CognitoIdentityCredentials({
		IdentityPoolId: identityPoolId,
		Logins: {
			[`${url}/${userPoolId}`]: userSession.getIdToken().getJwtToken()
		},
	}, {
		region: 'eu-west-2'
	})	
	
	return {
		credentials,
		session: userSession,
		user: cognitoUser,
	}
}

interface Options {
	credentials: CognitoIdentityCredentials
}

let originalAWScredentials: AWS.Credentials | CredentialsOptions | null= null

export async function actAsUser(options: Options, testType: TestType = TestType.REMOTE) {
	
	if(originalAWScredentials == null) {
		originalAWScredentials = AWS.config.credentials
	}

	AWS.config.region = 'eu-west-2'
	if(testType == TestType.LOCAL) {
		AWS.config.cognitoidentity = {
			endpoint: 'http://localhost:4566',
			region: 'eu-west-2'
		}
		AWS.config.cognitoidentityserviceprovider = {
			endpoint: 'http://localhost:4566',
			region: 'eu-west-2'
		}
	}	

	

	AWS.config.credentials = options.credentials

	await (AWS.config.credentials as CognitoIdentityCredentials).getPromise()
	await new Promise<void>((resolve, reject)=> {
		(AWS.config.credentials as CognitoIdentityCredentials).refresh(err => {
			if(err) {
				console.error(err)
				console.error(err.message)
				return reject(err)
			}
			return resolve()
		})
	
	})

	return originalAWScredentials
}

export function unactAsUser() {
	if(originalAWScredentials == null) return
	
	AWS.config.update({
		credentials: originalAWScredentials
	})
}