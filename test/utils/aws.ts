import AWS from 'aws-sdk'
import fs from 'fs'
import path from 'path'
type RootType = string | MapType | number  | MapType | boolean

interface MapType {
	[k: string]: RootType | Array<RootType>
}

interface RefObject {
	[k: string]: string | number | boolean | RefObject
}

export function buildCfnString(template: RootType, references: RefObject): string {
	

	if(typeof template === 'string') {
		return template
	}
	else if(typeof template === 'number') {
		return template + ''
	}
	else if(typeof template === 'boolean') {
		return template + ''
	}
	else if(typeof template == 'object') {
		if(Object.keys(template).length > 1) throw Error('template can only have one key in map')
		let returnValue = ''

		//check if is an intrinsic function in the key
		Object.entries(template).forEach(([key, value])=> {
			switch(key) {
				case 'Fn::Base64':
					throw Error('Fn::Base64 not implemented')
					break
				case 'Fn::Cidr':
					throw Error('Fn::Cidr not implemented')
					break
				case 'Fn::FindInMap':
					throw Error('Fn::FindInMap not implemented')
					break
				case 'Fn::GetAtt': {
					if(!Array.isArray(value)) throw Error('value must be an array for GetAtt')
					if(value.length != 2) throw Error('value array length must be exactly 2 for GetAtt')
					if(typeof value[0] !== 'string') throw Error('value[0] must be a string for GetAtt')
					if(typeof value[1] !== 'string') throw Error('value[1] must be a string for GetAtt')
					if(references[value[0]] == null) throw Error(`references doesnt contain key ${value[0]}`)
					if(references[value[0]][value[1]] == null) throw Error(`references doesnt contain key ${value[1]}`)

					returnValue = references[value[0]][value[1]]
					break
				}
				case 'Fn::GetAZs':
					throw Error('Fn::GetAZs not implemented')
					break
				case 'Fn::ImportValue':
					throw Error('Fn::ImportValue not implemented')
					break
				case 'Fn::Join': {
					if(!Array.isArray(value)) throw Error('Fn::Join value must be an array')
					if(value.length != 2) throw Error('Fn::Join array length must be exatly 2')
					const delimitter = value[0]
					const joinArr =value[1]

					if(typeof delimitter !== 'string') throw new Error('Fn::Join[0] must be a string delimitter')
					if(!Array.isArray(joinArr)) throw Error('Fn::Join array[1] must be an array')
					const builtJoinArr = joinArr.map((joinVal)=> {
						return buildCfnString(joinVal, references)
					})
					returnValue = builtJoinArr.join(delimitter)

					break
				}
				case 'Fn::Select':
					throw Error('Fn::Select not implemented')
					break
				case 'Fn::Split':
					throw Error('Fn::Split not implemented')
					break
				case 'Fn::Sub':{
					throw Error('Fn::Sub not implemented')
				}
				case 'Fn::Transform':
					throw Error('Fn::Transform not implemented')
					break
				case 'Fn::And':
					throw Error('Fn::Transform not implemented')
					break
				case 'Fn::If':
					throw Error('Fn::If not implemented')
					break
				case 'Fn::Equals':
					throw Error('Fn::Equals not implemented')
					break
				case 'Fn::Not':
					throw Error('Fn::Not not implemented')
					break
				case 'Fn::Or':
					throw Error('Fn::Or not implemented')
					break
				case 'Ref': {
					if(typeof value !== 'string') throw new Error('Ref value must be a string')
					if(references[value] == null) throw new Error(`${value} must be in references`)

					returnValue = references[value] + ''
					// throw Error('Ref not implemented')
					break
				}
				default: {
					throw Error('unknown cfn function')
				}
			}
		})

		return returnValue
	}

	throw Error('we shouldnt be here')

}

interface Creds {
	accessKeyId: string
	secretAccessKey: string
	sessionToken: string
}

export let credentials: Creds | null = null

function getRoleArn(stage: string) {
	switch(stage) {
		case 'sandbox': {
			return 'arn:aws:iam::224096475237:role/CounterweightSandboxAdmin'
		}
		case 'predev': {
			return 'arn:aws:iam::564054813814:role/CounterweightPreDevAdmin'
		}
		case 'dev': {
			return 'arn:aws:iam::876771502364:role/CounterweightDevAdmin'
		}
		case 'staging': {
			return 'arn:aws:iam::194451444253:role/CounterweightStagingAdmin'
		}
		case 'production': {
			return 'arn:aws:iam::111818226292:role/CounterweightProductionAdmin'
		}
	}
}

const TEMP_CREDS_PATH = path.join(__dirname, 'test-aws-credentials.json')

export function configureAws() {
	
	if(!fs.existsSync(TEMP_CREDS_PATH)) {
		
		const currentCredentials = new AWS.SharedIniFileCredentials({profile: 'counterweight-danielblignaut'})
		AWS.config.credentials = currentCredentials
		AWS.config.region = 'eu-west-2'

		const sts = new AWS.STS()
		return sts.assumeRole({
			RoleArn: getRoleArn(process.env.STAGE),
			RoleSessionName: 'awssdk'
		})
			.promise()
			.then((data)=> {
				credentials = {
					accessKeyId: data.Credentials.AccessKeyId,
					secretAccessKey: data.Credentials.SecretAccessKey,
					sessionToken: data.Credentials.SessionToken
				}
				AWS.config.update({
					accessKeyId: data.Credentials.AccessKeyId,
					secretAccessKey: data.Credentials.SecretAccessKey,
					sessionToken: data.Credentials.SessionToken
				})
				

				fs.writeFileSync(TEMP_CREDS_PATH, JSON.stringify({
					accessKeyId: data.Credentials.AccessKeyId,
					secretAccessKey: data.Credentials.SecretAccessKey,
					sessionToken: data.Credentials.SessionToken
				}))

				return new Promise<void>((resolve, reject)=> {
					AWS.config.getCredentials((err, creds)=> {
						if(err) {
							return reject(err)
						}

						return resolve()
					})

				})
			})
	}
	else {
		const credString = fs.readFileSync(TEMP_CREDS_PATH, { encoding: 'utf8' })
		const creds = JSON.parse(credString)
		credentials = creds
		AWS.config.update(creds)

		return Promise.resolve()
	}

}

export async function getCredentials() {
	if(credentials != null) {
		return Promise.resolve(credentials)
	}
	else {
		return new Promise<Creds>((resolve)=> {
			let innerTimer = null
			const timer = setTimeout(function check() {
				if(credentials != null) {
					resolve(credentials)
				}
				else {
					innerTimer = setTimeout(check, 20)
				}
			}, 500)
		})
	}
}