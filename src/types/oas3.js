/* @flow */

type ExternalDocumentationObject = {
  description?: string,
  url: string
}

export type ParameterObject = {
  name: string,
  in: 'query' | 'header' | 'path' | 'cookie',
  description?: string,
  required?: boolean,
  deprecated?: boolean,
  allowEmptyValue?: boolean
}

export type ReferenceObject = {
  '$ref': string
}

type ExampleObject = {
  summary?: string,
  description?: string,
  value?: any,
  externalValue?: string
}

type HeaderObject = {
  name?: string,
  in?: 'query' | 'header' | 'path' | 'cookie',
  description?: string,
  required?: boolean,
  deprecated?: boolean,
  allowEmptyValue?: boolean
}

type EncodingObject = {
  contentType?: string,
  headers?: {
    [string]: HeaderObject | ReferenceObject
  },
  style?: string,
  explode?: boolean,
  allowReserved?: boolean
}

export type SchemaObject = Object // TODO: extend?

export type MediaTypesObject = {
  [string]: MediaTypeObject
}

export type MediaTypeObject = {
  schema?: SchemaObject | ReferenceObject,
  example?: any,
  examples?: {
    [string]: ExampleObject | ReferenceObject
  },
  encoding?: {
    [string]: EncodingObject
  }
}

export type RequestBodyObject = {
  description?: string,
  content: {
    [string]: MediaTypeObject
  },
  required?: boolean
}

export type LinkObject = {
  operationRef?: string,
  operationId?: string,
  parameters?: {
    [string]: any
  },
  requestBody?: any,
  description?: string,
  server?: ServerObject
}

export type LinksObject = {
  [string]: LinkObject | ReferenceObject
}

export type ResponsesObject = {
  [string]: ResponseObject | ReferenceObject
}

export type ResponseObject = {
  description: string,
  headers?: {
    [string]: HeaderObject | ReferenceObject
  },
  content?: MediaTypesObject,
  links?: LinksObject
}

export type SecurityRequirementObject = {
  [string]: string[]
}

export type OperationObject = {
  tags?: string[],
  summary?: string,
  description?: string,
  externalDocs?: ExternalDocumentationObject,
  operationId?: string,
  parameters?: Array<ParameterObject | ReferenceObject>,
  requestBody?: RequestBodyObject | ReferenceObject,
  responses?: ResponsesObject,
  callbacks?: any, // TODO: extend?
  deprecated?: boolean,
  security?: SecurityRequirementObject[],
  servers?: ServerObject[]
}

export type PathItemObject = {
  '$ref'?: string,
  summary?: string,
  description?: string,
  [string]: OperationObject,
  servers?: ServerObject[],
  parameters?: Array<ParameterObject | ReferenceObject>
}

type PathsObject = {
  [string]: PathItemObject
}

export type ServerObject = {
  url: string,
  description?: string,
  variables?: Object // TODO: extend
}

type OAuthFlowObject = {
  authorizationUrl?: string, // optional, beacause applies only to certain flows
  tokenUrl?: string, // optional, beacause applies only to certain flows
  refreshUrl?: string, // optional, beacause applies only to certain flows
  scopes?: { // optional, beacause applies only to certain flows
    [string]: string
  }
}

type OAuthFlowsObject = {
  implicit?: OAuthFlowObject,
  password?: OAuthFlowObject,
  clientCredentials?: OAuthFlowObject,
  authorizationCode?: OAuthFlowObject
}

export type SecuritySchemesObject = {
  [string]: SecuritySchemeObject | ReferenceObject
}

export type SecuritySchemeObject = {
  type: 'apiKey' | 'http' | 'oauth2' | 'openIdConnect',
  description?: string,
  name?: string, // optional, because applies only to apiKey
  in?: string, // optional, because applies only to apiKey
  scheme?: string,  // optional, because applies only to http
  bearerFormat?: string,
  flows?: OAuthFlowsObject,  // optional, because applies only to oauth2
  openIdConnectUrl?: string // // optional, because applies only to openIdConnect
}

type ComponentsObject = {
  schemas?: {
    [string]: SchemaObject | ReferenceObject
  },
  responses?: ResponsesObject,
  parameters?: {
    [string]: ParameterObject | ReferenceObject
  },
  examples?: {
    [string]: ExampleObject | ReferenceObject
  },
  requestBodies?: {
    [string]: RequestBodyObject | ReferenceObject
  },
  headers?: {
    [string]: HeaderObject | ReferenceObject
  },
  securitySchemes?: SecuritySchemesObject,
  links?: LinksObject,
  callbacks?: {
    [string]: Object | ReferenceObject
  }
}

type TagObject = {
  name: string,
  description?: string,
  externalDocs?: ExternalDocumentationObject
}

export type Oas3 = {
  openapi: string,
  info: {
    title: string,
    description?: string,
    termsOfService?: string,
    contact?: {
      name?: string,
      url?: string,
      email?: string
    },
    license?: {
      name: string,
      url?: string
    },
    version: string
  },
  servers?: ServerObject[],
  paths: PathsObject,
  components?: ComponentsObject,
  security?: SecurityRequirementObject[],
  tags?: TagObject[],
  externalDocs?: ExternalDocumentationObject
}
