import {JSONSchema4Type, JSONSchema4TypeName} from 'json-schema'
import {findKey, includes, isPlainObject, map, memoize, omit} from 'lodash'
import {format} from 'util'
import {Options} from './'
import {typesOfSchema} from 'json-schema-to-typescript/dist/src/typesOfSchema'
import {
  AST,
  T_ANY,
  T_ANY_ADDITIONAL_PROPERTIES,
  TInterface,
  TInterfaceParam,
  TNamedInterface,
  TTuple,
  T_UNKNOWN,
  T_UNKNOWN_ADDITIONAL_PROPERTIES,
  TIntersection
} from 'json-schema-to-typescript/dist/src/types/AST'
import {
  getRootSchema,
  isPrimitive,
  JSONSchema as LinkedJSONSchema,
  JSONSchemaWithDefinitions,
  SchemaSchema,
  SchemaType
} from 'json-schema-to-typescript/dist/src/types/JSONSchema'
import {generateName, log, maybeStripDefault, maybeStripNameHints} from 'json-schema-to-typescript/dist/src/utils'
import { DynamoDbMetadata, DynamoAST } from './types'

export type Processed = Map<LinkedJSONSchema, Map<SchemaType, AST>>

export type UsedNames = Set<string>




type DynamoDBSchema = (LinkedJSONSchema | JSONSchema4Type) & {
	dynamodb_model?: boolean
	dynamodb_partition_key?: boolean
	dynamodb_sort_key?: boolean
	dynamodb_gsi_partition_key?: string
	dynamodb_gsi_sort_key?: string
}

function dynamodbFields(schema: DynamoDBSchema): DynamoDbMetadata {
	return {
		dynamodbModel: schema.dynamodb_model,
		dynamodbPartitionKey: schema.dynamodb_partition_key,
		dynamodbSortKey: schema.dynamodb_sort_key,
		dynamodbGsiPartitionKey: schema.dynamodb_gsi_partition_key,
		dynamodbGsiSortKey: schema.dynamodb_gsi_sort_key
	}
}

export function parse(
  schema: LinkedJSONSchema | JSONSchema4Type,
  options: Options,
  keyName?: string,
  processed: Processed = new Map(),
  usedNames = new Set<string>()
): DynamoAST {
  if (isPrimitive(schema)) {
    return parseLiteral(schema, keyName)
  }

  const types = typesOfSchema(schema)
  if (types.length === 1) {
    const ast = parseAsTypeWithCache(schema, types[0], options, keyName, processed, usedNames)
    log('blue', 'parser', 'Types:', types, 'Input:', schema, 'Output:', ast)
    return ast
  }

  // Be careful to first process the intersection before processing its params,
  // so that it gets first pick for standalone name.
  const ast = parseAsTypeWithCache(
    {
      allOf: [],
      description: schema.description,
      id: schema.id,
      title: schema.title
    },
    'ALL_OF',
    options,
    keyName,
    processed,
    usedNames
  ) as TIntersection

  ast.params = types.map(type =>
    // We hoist description (for comment) and id/title (for standaloneName)
    // to the parent intersection type, so we remove it from the children.
    parseAsTypeWithCache(maybeStripNameHints(schema), type, options, keyName, processed, usedNames)
  )

  log('blue', 'parser', 'Types:', types, 'Input:', schema, 'Output:', ast)
  return ast
}

function parseAsTypeWithCache(
  schema: LinkedJSONSchema,
  type: SchemaType,
  options: Options,
  keyName?: string,
  processed: Processed = new Map(),
  usedNames = new Set<string>()
): DynamoAST {
  // If we've seen this node before, return it.
  let cachedTypeMap = processed.get(schema)
  if (!cachedTypeMap) {
    cachedTypeMap = new Map()
    processed.set(schema, cachedTypeMap)
  }
  const cachedAST = cachedTypeMap.get(type)
  if (cachedAST) {
    return cachedAST
  }

  // Cache processed ASTs before they are actually computed, then update
  // them in place using set(). This is to avoid cycles.
  // TODO: Investigate alternative approaches (lazy-computing nodes, etc.)
  const ast = {} as AST
  cachedTypeMap.set(type, ast)

  // Update the AST in place. This updates the `processed` cache, as well
  // as any nodes that directly reference the node.
  return Object.assign(ast, parseNonLiteral(schema, type, options, keyName, processed, usedNames))
}

function parseLiteral(schema: JSONSchema4Type, keyName: string | undefined): DynamoAST {
  return {
    keyName,
    params: schema,
    type: 'LITERAL',
  }
}

function parseNonLiteral(
  schema: LinkedJSONSchema,
  type: SchemaType,
  options: Options,
  keyName: string | undefined,
  processed: Processed,
  usedNames: UsedNames
): DynamoAST {
  const definitions = getDefinitionsMemoized(getRootSchema(schema as any)) // TODO
  const keyNameFromDefinition = findKey(definitions, _ => _ === schema)

  switch (type) {
    case 'ALL_OF':
      return {
        comment: schema.description,
        keyName,
        standaloneName: standaloneName(schema, keyNameFromDefinition, usedNames),
        params: schema.allOf!.map(_ => parse(_, options, undefined, processed, usedNames)),
		type: 'INTERSECTION',
		...dynamodbFields(schema)
      }
    case 'ANY':
      return {
        ...(options.unknownAny ? T_UNKNOWN : T_ANY),
        comment: schema.description,
        keyName,
		standaloneName: standaloneName(schema, keyNameFromDefinition, usedNames),
		...dynamodbFields(schema)
      }
    case 'ANY_OF':
      return {
        comment: schema.description,
        keyName,
        standaloneName: standaloneName(schema, keyNameFromDefinition, usedNames),
        params: schema.anyOf!.map(_ => parse(_, options, undefined, processed, usedNames)),
		type: 'UNION',
		...dynamodbFields(schema)
      }
    case 'BOOLEAN':
      return {
        comment: schema.description,
        keyName,
        standaloneName: standaloneName(schema, keyNameFromDefinition, usedNames),
		type: 'BOOLEAN',
		...dynamodbFields(schema)
		
      }
    case 'CUSTOM_TYPE':
      return {
        comment: schema.description,
        keyName,
        params: schema.tsType!,
        standaloneName: standaloneName(schema, keyNameFromDefinition, usedNames),
		type: 'CUSTOM_TYPE',
		...dynamodbFields(schema)
      }
    case 'NAMED_ENUM':
      return {
        comment: schema.description,
        keyName,
        standaloneName: standaloneName(schema, keyNameFromDefinition ?? keyName, usedNames)!,
        params: schema.enum!.map((_, n) => ({
          ast: parse(_, options, undefined, processed, usedNames),
          keyName: schema.tsEnumNames![n]
        })),
        type: 'ENUM',
		...dynamodbFields(schema)
      }
    case 'NAMED_SCHEMA':
      return newInterface(schema as SchemaSchema, options, processed, usedNames, keyName)
    case 'NULL':
      return {
        comment: schema.description,
        keyName,
        standaloneName: standaloneName(schema, keyNameFromDefinition, usedNames),
        type: 'NULL',
		...dynamodbFields(schema)
      }
    case 'NUMBER':
      return {
        comment: schema.description,
        keyName,
        standaloneName: standaloneName(schema, keyNameFromDefinition, usedNames),
        type: 'NUMBER',
		...dynamodbFields(schema)
      }
    case 'OBJECT':
      return {
        comment: schema.description,
        keyName,
        standaloneName: standaloneName(schema, keyNameFromDefinition, usedNames),
        type: 'OBJECT',
		...dynamodbFields(schema)
      }
    case 'ONE_OF':
      return {
        comment: schema.description,
        keyName,
        standaloneName: standaloneName(schema, keyNameFromDefinition, usedNames),
        params: schema.oneOf!.map(_ => parse(_, options, undefined, processed, usedNames)),
        type: 'UNION',
		...dynamodbFields(schema)
      }
    case 'REFERENCE':
      throw Error(format('Refs should have been resolved by the resolver!', schema))
    case 'STRING':
      return {
        comment: schema.description,
        keyName,
        standaloneName: standaloneName(schema, keyNameFromDefinition, usedNames),
		type: 'STRING',
		...dynamodbFields(schema)
      }
    case 'TYPED_ARRAY':
      if (Array.isArray(schema.items)) {
        // normalised to not be undefined
        const minItems = schema.minItems!
        const maxItems = schema.maxItems!
        const arrayType: TTuple = {
          comment: schema.description,
          keyName,
          maxItems,
          minItems,
          standaloneName: standaloneName(schema, keyNameFromDefinition, usedNames),
          params: schema.items.map(_ => parse(_, options, undefined, processed, usedNames)),
          type: 'TUPLE'
        }
        if (schema.additionalItems === true) {
          arrayType.spreadParam = options.unknownAny ? T_UNKNOWN : T_ANY
        } else if (schema.additionalItems) {
          arrayType.spreadParam = parse(schema.additionalItems, options, undefined, processed, usedNames)
        }
        return arrayType
      } else {
        return {
          comment: schema.description,
          keyName,
          standaloneName: standaloneName(schema, keyNameFromDefinition, usedNames),
          params: parse(schema.items!, options, undefined, processed, usedNames),
		  type: 'ARRAY',
		  ...dynamodbFields(schema)
        }
      }
    case 'UNION':
      return {
        comment: schema.description,
        keyName,
        standaloneName: standaloneName(schema, keyNameFromDefinition, usedNames),
        params: (schema.type as JSONSchema4TypeName[]).map(type => {
          const member: LinkedJSONSchema = {...omit(schema, 'description', 'id', 'title'), type}
          return parse(maybeStripDefault(member as any), options, undefined, processed, usedNames)
        }),
        type: 'UNION',
		...dynamodbFields(schema)
      }
    case 'UNNAMED_ENUM':
      return {
        comment: schema.description,
        keyName,
        standaloneName: standaloneName(schema, keyNameFromDefinition, usedNames),
        params: schema.enum!.map(_ => parse(_, options, undefined, processed, usedNames)),
        type: 'UNION',
		...dynamodbFields(schema)
      }
    case 'UNNAMED_SCHEMA':
      return newInterface(schema as SchemaSchema, options, processed, usedNames, keyName, keyNameFromDefinition)
    case 'UNTYPED_ARRAY':
      // normalised to not be undefined
      const minItems = schema.minItems!
      const maxItems = typeof schema.maxItems === 'number' ? schema.maxItems : -1
      const params = options.unknownAny ? T_UNKNOWN : T_ANY
      if (minItems > 0 || maxItems >= 0) {
        return {
          comment: schema.description,
          keyName,
          maxItems: schema.maxItems,
          minItems,
          // create a tuple of length N
          params: Array(Math.max(maxItems, minItems) || 0).fill(params),
          // if there is no maximum, then add a spread item to collect the rest
          spreadParam: maxItems >= 0 ? undefined : params,
          standaloneName: standaloneName(schema, keyNameFromDefinition, usedNames),
		  type: 'TUPLE',
		  ...dynamodbFields(schema)
        }
      }

      return {
        comment: schema.description,
        keyName,
        params,
        standaloneName: standaloneName(schema, keyNameFromDefinition, usedNames),
		type: 'ARRAY',
		...dynamodbFields(schema)
      }
  }
}

/**
 * Compute a schema name using a series of fallbacks
 */
function standaloneName(
  schema: LinkedJSONSchema,
  keyNameFromDefinition: string | undefined,
  usedNames: UsedNames
): string | undefined {
  const name = schema.title || schema.id || keyNameFromDefinition
  if (name) {
    return generateName(name, usedNames)
  }
}

function newInterface(
  schema: SchemaSchema,
  options: Options,
  processed: Processed,
  usedNames: UsedNames,
  keyName?: string,
  keyNameFromDefinition?: string
): TInterface {
  const name = standaloneName(schema, keyNameFromDefinition, usedNames)!
  return {
    comment: schema.description,
    keyName,
    params: parseSchema(schema, options, processed, usedNames, name),
    standaloneName: name,
    superTypes: parseSuperTypes(schema, options, processed, usedNames),
	type: 'INTERFACE',
	...dynamodbFields(schema)
  }
}

function parseSuperTypes(
  schema: SchemaSchema,
  options: Options,
  processed: Processed,
  usedNames: UsedNames
): TNamedInterface[] {
  // Type assertion needed because of dereferencing step
  // TODO: Type it upstream
  //@ts-ignore
  const superTypes = schema.extends as SchemaSchema[] | undefined
  if (!superTypes) {
    return []
  }
  return superTypes.map(_ => parse(_, options, undefined, processed, usedNames) as TNamedInterface)
}

/**
 * Helper to parse schema properties into params on the parent schema's type
 */
function parseSchema(
  schema: SchemaSchema,
  options: Options,
  processed: Processed,
  usedNames: UsedNames,
  parentSchemaName: string
): TInterfaceParam[] {
  let asts: TInterfaceParam[] = map(schema.properties, (value, key: string) => ({
    ast: parse(value, options, key, processed, usedNames),
    isPatternProperty: false,
    isRequired: includes(schema.required || [], key),
    isUnreachableDefinition: false,
    keyName: key
  }))

  let singlePatternProperty = false
  if (schema.patternProperties) {
    // partially support patternProperties. in the case that
    // additionalProperties is not set, and there is only a single
    // value definition, we can validate against that.
    singlePatternProperty = !schema.additionalProperties && Object.keys(schema.patternProperties).length === 1

    asts = asts.concat(
      map(schema.patternProperties, (value, key: string) => {
        const ast = parse(value, options, key, processed, usedNames)
        const comment = `This interface was referenced by \`${parentSchemaName}\`'s JSON-Schema definition
via the \`patternProperty\` "${key}".`
        ast.comment = ast.comment ? `${ast.comment}\n\n${comment}` : comment
        return {
          ast,
          isPatternProperty: !singlePatternProperty,
          isRequired: singlePatternProperty || includes(schema.required || [], key),
          isUnreachableDefinition: false,
          keyName: singlePatternProperty ? '[k: string]' : key
        }
      })
    )
  }

  if (options.unreachableDefinitions) {
    asts = asts.concat(
      map(schema.definitions, (value, key: string) => {
        const ast = parse(value, options, key, processed, usedNames)
        const comment = `This interface was referenced by \`${parentSchemaName}\`'s JSON-Schema
via the \`definition\` "${key}".`
        ast.comment = ast.comment ? `${ast.comment}\n\n${comment}` : comment
        return {
          ast,
          isPatternProperty: false,
          isRequired: includes(schema.required || [], key),
          isUnreachableDefinition: true,
          keyName: key
        }
      })
    )
  }

  // handle additionalProperties
  switch (schema.additionalProperties) {
    case undefined:
    case true:
      if (singlePatternProperty) {
        return asts
      }
      return asts.concat({
        ast: options.unknownAny ? T_UNKNOWN_ADDITIONAL_PROPERTIES : T_ANY_ADDITIONAL_PROPERTIES,
        isPatternProperty: false,
        isRequired: true,
        isUnreachableDefinition: false,
        keyName: '[k: string]'
      })

    case false:
      return asts

    // pass "true" as the last param because in TS, properties
    // defined via index signatures are already optional
    default:
      return asts.concat({
        ast: parse(schema.additionalProperties, options, '[k: string]', processed, usedNames),
        isPatternProperty: false,
        isRequired: true,
        isUnreachableDefinition: false,
        keyName: '[k: string]'
      })
  }
}

type Definitions = {[k: string]: LinkedJSONSchema}

function getDefinitions(
  schema: LinkedJSONSchema,
  isSchema = true,
  processed = new Set<LinkedJSONSchema>()
): Definitions {
  if (processed.has(schema)) {
    return {}
  }
  processed.add(schema)
  if (Array.isArray(schema)) {
    return schema.reduce(
      (prev, cur) => ({
        ...prev,
        ...getDefinitions(cur, false, processed)
      }),
      {}
    )
  }
  if (isPlainObject(schema)) {
    return {
      ...(isSchema && hasDefinitions(schema) ? schema.definitions : {}),
      ...Object.keys(schema).reduce<Definitions>(
        (prev, cur) => ({
          ...prev,
          ...getDefinitions(schema[cur], false, processed)
        }),
        {}
      )
    }
  }
  return {}
}

const getDefinitionsMemoized = memoize(getDefinitions)

/**
 * TODO: Reduce rate of false positives
 */
function hasDefinitions(schema: LinkedJSONSchema): schema is JSONSchemaWithDefinitions {
  return 'definitions' in schema
}