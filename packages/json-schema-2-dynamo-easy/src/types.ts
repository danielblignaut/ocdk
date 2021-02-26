import {
	AST,

  } from 'json-schema-to-typescript/dist/src/types/AST'
export interface DynamoDbMetadata {
	dynamodbModel?: boolean
	dynamodbPartitionKey?: boolean
	dynamodbSortKey?: boolean
	dynamodbGsiPartitionKey?: string
	dynamodbGsiSortKey?: string
}

export type DynamoAST = AST & DynamoDbMetadata
