
export const objectsAreEqual = (a: any, b: any) => {
	if (a === b) return true

	if (typeof a != 'object' || typeof b != 'object' || a == null || b == null) return false

	const keysA = Object.keys(a), keysB = Object.keys(b)

	if (keysA.length != keysB.length) return false

	for (const key of keysA) {
		if (!keysB.includes(key)) return false

		if (typeof a[key] === 'function' || typeof b[key] === 'function') {
		
			if (a[key].toString() != b[key].toString()) return false
			
		} else {
			if (!objectsAreEqual(a[key], b[key])) return false
		}
	}

	return true
}

interface DidStreamModelsChangeOpts {
	typeNameList: string[]
	eventType: string
	oldModel: {[k: string]: any}
	newModel: {[k: string]: any}
}

interface DidStreamModelsChangeResult {
	didItChange: boolean
	typename: string | null
}


export const didStreamModelsChange = (opts: DidStreamModelsChangeOpts): DidStreamModelsChangeResult=> {
	const {
		typeNameList,
		eventType,
		oldModel,
		newModel
	} = opts

	console.log(opts)

	let typename: string | null = null
	let hasModelFieldChanged = false

	if(newModel != null && newModel.__typename != null && newModel.__typename != null) {
		typename = newModel.__typename
	}
	if(oldModel != null && oldModel.__typename != null && oldModel.__typename != null) {
		typename= oldModel.__typename
	}
	
	if(typename == null ) {
		hasModelFieldChanged = false
	}
	else if(!typeNameList.includes(typename)) {
		hasModelFieldChanged = false
	}
	else {
		if(eventType == 'MODIFY') {
			const oldRecord = oldModel
			const newRecord = newModel
	
			Object.entries(oldRecord).forEach(([key, oldValue])=> {
				if(![
					'version',
					'createdAt',
					'updatedAt',
					'__typename',
					'versionCreatedAt',
					'versionUpdatedAt'
	
				].includes(key)) {
					if(newRecord[key] == null || ! objectsAreEqual(newRecord[key], oldRecord[key])) {
						console.log(newRecord[key])
						console.log(oldRecord[key])
						console.log('modify changed')
						hasModelFieldChanged = true
					}
				}
			})
	
			Object.entries(newRecord).forEach(([key, newValue])=> {
				if(![
					'version',
					'createdAt',
					'updatedAt',
					'__typename',
					'versionCreatedAt',
					'versionUpdatedAt'
	
				].includes(key)) {
					if(oldRecord[key] == null || ! objectsAreEqual(newRecord[key], oldRecord[key])) {
						console.log(newRecord[key])
						console.log(oldRecord[key])
						console.log('modify changed')
						hasModelFieldChanged = true
					}
				}
			})
		}
		else {
			console.log('insert or delete changed')
			hasModelFieldChanged = true
		}
	}

	return {
		typename,
		didItChange: hasModelFieldChanged
	}
}