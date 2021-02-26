import path from 'path'
import fs from 'fs'


export const getStack = async ()=> {
	const final = {
		Resources: {}
	}

	const dir = path.join(__dirname, './packages/app/cdk.out')
	const files = await fs.promises.readdir( dir )

	for( const file of files ) {
		const extArr = file.split('.')

		if(extArr[extArr.length -1] == 'json') {
			const json = require(file)

			if(json.Resources != null) {
				final.Resources = {
					...final.Resources,
					...json.Resources
				}
			}
		}
	} 


	return final
}