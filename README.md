# OASGraph

Turns APIs described by OpenAPI specifications (OAS) into GraphQL interfaces.

<img src="docs/translation.png" alt="Overview of translation" width="600">


## Characteristics

* **Data-centric**
  The GraphQL interface is created around the data definitions in the given OAS, not around the endpoints, leading to a natural use of GraphQL.

  <img src="docs/data-centric.png" alt="Example of data-centric design" width="600">

* **Nested data**
  [Links](https://github.com/OAI/OpenAPI-Specification/blob/OpenAPI.next/versions/3.0.md#linksObject) defined in the OAS are used to compose data definitions.

  <img src="docs/links.png" alt="Example of links resolution" width="600">

* **Automatic query resolution**
  Automatically generated resolvers translate (nested) GraphQL queries to API requests. Request results are translated back to GraphQL responses.

  <img src="docs/resolution.png" alt="Example of query resolution" width="600">

* **Mutations**
  Non-safe, non-idempotent API operations (e.g., `POST`, `PUT`, `DELETE`) are translated to GraphQL [mutations](http://graphql.org/learn/queries/#mutations). Input payload is type-checked.

  <img src="docs/mutations.png" alt="Example of mutation" width="600">

* **Authentication**
  OASGraph currently supports authentication via API Key and basic auth. OASGraph wraps secured endpoints into a `viewer`, which takes the API key / credentials as input.

  <img src="docs/auth.png" alt="Example of authentication" width="600">

* **API Sanitation**
  Parts of an API that not compatible with GraphQL are automatically sanitized. For example, API parameters and data definition names with unsupported characters (e.g., `-`, `.`, `,`, `:`, `;`...) are sanitized.

* **Custom request options** Provide headers and query parameters to send with every API request. This allows, for example, to handle authentication or tag requests from GraphQL.

* **Swagger and OpenAPI 3 support** OASGraph can handle both Swagger (OpenAPI specification 2.0) as well as OpenAPI specification 3.


## Usage
Install this package. Then, simply pass it an OpenAPI Specification 3.0. The library returns a promise:

```javascript
const OASGraph = require('oasgraph') // use real name here

let oas = require('./fixtures/example_oas.json') // or other means of obtaining the OAS

OASGraph.createGraphQlSchema(oas)
  .then(schema => {
    // do something with the schema
  })
  .catch(err => {
    // handle errors when creating the schema
  })
```

You can then use the generated schema, for example to be served using [Express.js](http://expressjs.com/):

```javascript
const express = require('express')
const graphqlHTTP = require('express-graphql')
const OASGraph = require('oasgraph') // use real name here
const app = express()

OASGraph.createGraphQlSchema(oas)
  .then(schema => {
    app.use('/graphql', graphqlHTTP({
      schema: schema,
      graphiql: true
    }))
    app.listen(3001)
  })
  .catch(err => {
    // handle errors when creating the schema
  })
```


## Options
OASGraph allows to define an optional `options` object:

```javascript
OASGraph.createGraphQLSchema(oas, options)
```

The following options can be set:

* `headers` (type: `object`, default: `{}`): Headers to be sent in every request. Parameters defined in the OpenAPI Specification to set these headers will be ignored by OASGraph.

* `qs` (type: `object`, default: `{}`): Query parameters to be sent in every request. Parameters defined in the OpenAPI Specification to set these query parameters will be ignored by OASGraph.

* `viewer` (type: `boolean`, default: `true`): The viewer object types (i.e. QueryViewer and MutationViewer) are artificial constructs that allow a user to pass authentication credentials to OASGraph. Unfortunately, they are bulky and do not provide an accurate representation of the API. Depending on the API, it may be possible to send all your credentials through the header option, so if you would like to authenticate without the OASGraph-generated viewer object types, you can set the viewer option to false. 

For example:

```javascript
OASGraph.createGraphQLSchema(oas, {
  headers: {
    authorization: 'asfl3032lkj2' // send authorization header in every request
  },
  qs: {
    limit: 30 // send limit query string in every request
  }
})
```


## Authentication
Per default, OASGraph will wrap API requests that need authentication in corresponding `viewers`, which allow to pass required credentials. OASGraph currently supports viewers for API keys and basic authentication.

OASGraph further provides an `anyAuth` viewer, which allows to simultaneously provide information required by multiple authentication mechanisms. This mechanism allows OASGraph to resolve nested queries, which encompass API requests with different authentication mechanisms. For example, consider the following query:

```javascript
{
  viewerAnyAuth (
    exampleApiKeyProtocol: {apiKey: "a1p2i3k4e5y"}
    exampleBasicProtocol: {
      username: "erik"
      password: "secret"
    }
  ) {
    patentWithId (patentId: "test") {  // requires "exampleApiKeyProtocol"
      patentId
      inventor {                       // requires "exampleBasicProtocol"
        name
      }
    }
  }
}
```


## Testing
To test OASGraph, first make sure the example API server is running:

```bash
npm run api
```

Then, run tests:

```bash
npm test
```


### APIs.guru
OASGraph can be applied to all OAS contained in [APIs.guru OpenAPI repository](https://github.com/APIs-guru/openapi-directory). Load APIs.guru specifications into the `/tmp` folder:

```bash
npm run guru-load
```

Then, run tests:

```bash
npm run guru-test
```


## Logging
OASGraph provides multiple levels of logging, which can be controlled by a `DEBUG` environment variable. You can enable these levels using:

```bash
DEBUG=level_1,level_2 node app-using-oasgraph.js
```

The following logging levels are supported:

* `preprocessing`: Logs information about preprocessing the OAS to GraphQL.
* `translation`: Logs information about translating an OAS to GraphQL.
* `http`: Logs information about the HTTP requests made to the API.


## Similar projects

* [swagger-to-graphql](https://github.com/yarax/swagger-to-graphql) turns a given Swagger (OpenAPI Specification 2.0) into a GraphQL interface, which resolves against the original API. GraphQL schema is based on endpoints, not on data definitions. No links are considered.

* [json-to-graphql](https://github.com/aweary/json-to-graphql) turns given JSON objects / arrays into a GraphQL schema. `resolve` functions need to be provided by the user.

* [StackOverflow discussion](https://stackoverflow.com/questions/38339442/json-schema-to-graphql-schema-converters) points to the above projects.
