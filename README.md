# OASGraph

Turns APIs described by OpenAPI specifications (OAS) into GraphQL interfaces.


## Characteristics

* The GraphQL interface is created around the data definitions in the given OAS, not around the endpoints. This leads to a more natural use of GraphQL.
* Resolvers are auto-generated to translate (nested) GraphQL queries against the existing web API.
* [Links](https://github.com/OAI/OpenAPI-Specification/blob/OpenAPI.next/versions/3.0.md#linksObject) defined in the OAS are used to compose data definitions.


## Work in progress

- [x] Handle arrays
- [ ] Enable mutating operations (POST, PUT, DELETE...)
- [ ] Compose multiple OAS
- [ ] Handle authentication
- [ ] Translate Swagger/OAS 2.0 automatically


## Usage
Install this package. Then, simply pass it an OpenAPI Specification 3.0. The library returns a promise:

```javascript
const OASGraph = require('oasgraph') // use real name here

let oas = require('../fixtures/example_oas.json') // or other means of obtaining the OAS

OASGraph.createGraphQlSchema(oas)
  .then(schema => {
    // do something with the schema
  })
  .catch(err => {
    // handle errors when creating the schema
  })
```

You can then use the generated schema, for example to be served using express:

```javascript
const express = require('express')
const graphqlHTTP = require('express-graphql')
const OASGraph = require('oasgraph') // use real name here

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


## Testing
To test OASGraph, first make sure the example API server is running:

```bash
node test/example_api_server.js
```

Then, run tests:

```bash
npm test
```


## Similar projects

* [swagger-to-graphql](https://github.com/yarax/swagger-to-graphql) turns a given Swagger (OpenAPI Specification 2.0) into a GraphQL interface, which resolves against the original API. GraphQL schema is based on endpoints, not on data definitions. No links are considered.

* [json-to-graphql](https://github.com/aweary/json-to-graphql) turns given JSON objects / arrays into a GraphQL schema. `resolve` functions need to be provided by the user.

* [StackOverflow discussion](https://stackoverflow.com/questions/38339442/json-schema-to-graphql-schema-converters) points to the above projects.
