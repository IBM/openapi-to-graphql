declare module 'oasgraph' {
	import { Oas2 } from 'src/types/oas2'
	import { Oas3 } from 'src/types/oas3'
	import { Report } from 'src/types/options'
	interface IOptionsWithOptionals {
		/**
		 * Adhere to the OAS as closely as possible. If set to true, any deviation
		 * from the OAS will lead OASGraph to throw.
		 */
		strict?: boolean
		/**
		 * Custom headers to send with every request made by a resolve function.
		 */
		headers?: {
			[key: string]: string
		}
		/**
		 * Custom query parameters to send with every reqeust by a resolve function.
		 */
		qs?: {
			[key: string]: string
		}
		/**
		 * Determines whether OASGraph should create viewers that allow users to pass
		 * basic auth and API key credentials.
		 */
		viewer?: boolean
		/**
		 * Determines whether OASGraph will attempt to nest operations based on their
		 * URL structure (e.g., "/users/{id}" and "/users/{id}/friends").
		 */
		addSubOperations?: boolean
		/**
		 * JSON path to OAuth 2 token contained in GraphQL context. Tokens will per
		 * default be sent in "Authorization" header.
		 */
		tokenJSONpath?: string
		/**
		 * Determines whether to send OAuth 2 token as query parameter instead of in
		 * header.
		 */
		sendOAuthTokenInQuery?: boolean
		/**
		 * Holds information about the GraphQL schema generation process
		 */
		report?: Report
		/**
		 * Under certain circumstances (such as response code 204), some RESTful
		 * operations should not return any data. However, GraphQL objects must have
		 * a data structure. Normally, these operations would be ignored but for the
		 * sake of completeness, the following option will give these operations a
		 * placeholder data structure. Even though the data structure will not have
		 * any practical use, at least the operations will show up in the schema.
		 */
		fillEmptyResponses?: boolean
		/**
		 * Specifies the URL on which all paths will be based on.
		 * Overrides the server object in the OAS.
		 */
		baseUrl?: string
		/**
		 * Field names can only be beautified operationIds
		 *
		 * By default, query field names are based on the return type type name and
		 * mutation field names are based on the operationId, which may be generated
		 * if it does not exist.
		 *
		 * This option forces OASGraph to only create field names based on the
		 * operationId.
		 */
		operationIdFieldNames?: boolean
	}
	function createGraphQlSchema(
		spec: Oas3 | Oas2,
		options: IOptionsWithOptionals
	): Promise<any>
}
