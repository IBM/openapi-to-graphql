![GitHub last commit](https://img.shields.io/github/last-commit/ibm/openapi-to-graphql.svg?style=flat)
![Travis (.org)](https://img.shields.io/travis/ibm/openapi-to-graphql.svg?style=flat)
[![Join the chat at https://gitter.im/IBM/openapi-to-graphql](https://badges.gitter.im/IBM/openapi-to-graphql.svg?style=flat)](https://gitter.im/IBM/openapi-to-graphql?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)

# OpenAPI-to-GraphQL

Translate APIs described by [OpenAPI Specifications (OAS)](https://github.com/OAI/OpenAPI-Specification) or [Swagger](https://swagger.io/specification/v2/) into [GraphQL](https://graphql.org/).

<img src="https://raw.githubusercontent.com/ibm/openapi-to-graphql/master/docs/translation.png" alt="Overview of translation" width="600">

## Getting started

OpenAPI-to-GraphQL can be used in two ways:

### CLI

The Command Line Interface (CLI) provides a convenient way to start a GraphQL server wrapping an API for a given OpenAPI Specification:

1. Install the OpenAPI-to-GraphQL CLI using:
   ```bash
   npm i -g openapi-to-graphql-cli
   ```
2. Then, run the OpenAPI-to-GraphQL command and point it to an OpenAPI Specification:
   ```bash
   openapi-to-graphql <OAS JSON file path or remote url> [options]
   ```

For further details, refer to the [`openapi-to-graphql-cli` documentation](./packages/openapi-to-graphql-cli).

### Library

Use OpenAPI-to-GraphQL as a library in your application to generate GraphQL schemas.

1. Install OpenAPI-to-GraphQL as a dependency:
   ```bash
   npm i -s openapi-to-graphql
   ```
2. Require OpenAPI-to-GraphQL and use the `createGraphQLSchema` function:
   ```javascript
   const { createGraphQLSchema } = require("openapi-to-graphql");
   // load or construct OAS (const oas = ...)
   const { schema, report } = await createGraphQLSchema(oas);
   ```

For further details, refer to the [`openapi-to-graphql` documentation](./packages/openapi-to-graphql).

## Tutorials

Here are some guides to further help you get started:

- [CLI + Loopback tutorial](./docs/tutorials/cli_loopback.md): Learn how to quickly spin up GraphQL wrappers using the OpenAPI-to-GraphQL CLI.
- [Library tutorial](./docs/tutorials/watson.md): Learn how to use OpenAPI-to-GraphQL as a library, and how to improve the resulting GraphQL wrappers using OAS `link` definitions.
- [LoopBack tutorial](./docs/tutorials/loopback.md): Learn how to use OpenAPI-to-GraphQL to create GraphQL wrappers for APIs created with LoopBack 4.
- [Subscriptions tutorial](./packages/openapi-to-graphql/docs/subscriptions.md): Learn how to create a GraphQL API that supports subscription operations - including how to set up the API server that creates a PubSub instance wrapping a MQTT client.

## Characteristics

- **Data-centric**
  The GraphQL interface is created around the data definitions in the given OAS, not around the endpoints, leading to a natural use of GraphQL.

  <img src="https://raw.githubusercontent.com/ibm/openapi-to-graphql/master/docs/data-centric.png" alt="Example of data-centric design" width="600">

- **Nested data**
  [Links](https://github.com/OAI/OpenAPI-Specification/blob/OpenAPI.next/versions/3.0.0.md#link-Object) defined in the OAS are used to create nested data structures, allowing for (deeply) nested queries. 

  <img src="https://raw.githubusercontent.com/ibm/openapi-to-graphql/master/docs/links.png" alt="Example of links resolution" width="600">

- **Automatic query resolution**
  Automatically generated resolvers translate (nested) GraphQL queries to API requests. Request results are translated back to GraphQL responses.

  <img src="https://raw.githubusercontent.com/ibm/openapi-to-graphql/master/docs/resolution.png" alt="Example of query resolution" width="600">

- **Mutations**
  Non-safe, non-idempotent API operations (e.g., `POST`, `PUT`, `DELETE`) are translated to GraphQL [mutations](http://graphql.org/learn/queries/#mutations). Input payload is type-checked.

  <img src="https://raw.githubusercontent.com/ibm/openapi-to-graphql/master/docs/mutations.png" alt="Example of mutation" width="600">
  
- **Subscriptions**
  GraphQL [subscriptions](http://spec.graphql.org/draft/#sec-Subscription) allow clients to receive a stream of events, such as updates whenever data changes on the GraphQL server. OpenAPI-to-GraphQL can create subscriptions based on [`callback`](https://github.com/OAI/OpenAPI-Specification/blob/master/versions/3.0.2.md#CallbackObject) objects defined in the OAS.

  <img src="https://raw.githubusercontent.com/ibm/openapi-to-graphql/master/docs/subscriptions.png" alt="Example of subscription" width="600">

- **Authentication**
  OpenAPI-to-GraphQL currently supports authentication via API Key and basic auth. OpenAPI-to-GraphQL wraps secured endpoints into a `viewer`, which takes the API key / credentials as input.

  <img src="https://raw.githubusercontent.com/ibm/openapi-to-graphql/master/docs/auth.png" alt="Example of authentication" width="600">

- **API Sanitation**
  Parts of an API that not compatible with GraphQL are automatically sanitized. For example, API parameters and data definition names with unsupported characters (e.g., `-`, `.`, `,`, `:`, `;`...) are removed. GraphQL queries are desanitized to correctly invoke the REST API and the responses are resanitized to create GraphQL-compliant results.

  <img src="https://raw.githubusercontent.com/ibm/openapi-to-graphql/master/docs/sanitization.png" alt="Example of sanitation" width="300">

- **Custom request options** Provide headers and query parameters to send with every API request. This allows, for example, to handle authentication or tag requests from GraphQL.

- **Swagger and OpenAPI 3 support** OpenAPI-to-GraphQL can handle both Swagger (OpenAPI specification 2.0) as well as OpenAPI specification 3.

## Development

OpenAPI-to-GraphQL uses the [Lerna](https://github.com/lerna/lerna) monorepo management system. After cloning the entire monorepo repository, you can install Lerna with the command `npm install` and then install the dependencies for all of the packages with `lerna bootstrap`.

OpenAPI-to-GraphQL is written in [TypeScript](http://www.typescriptlang.org/). Within each of OpenAPI-to-GraphQL's packages, all source code is contained in the `src` folder. Use `npm run build` or `npm test` to transpile the source files into the final library in the `lib` folder. Entry-point for the library is `index.js` in `lib`.

## Research

Our research paper, "Generating GraphQL-Wrappers for REST(-like) APIs", can be found [here](https://arxiv.org/abs/1809.08319). The paper describes the challenges of building OpenAPI-to-GraphQL and an experiment in which we evaluated OpenAPI-to-GraphQL against 959 publicly available OAS, provided by [APIs.guru](https://apis.guru/), and successfully created GraphQL interfaces for 89.5% of them.

To run the experiment, in the [`openapi-to-graphql` package](./packages/openapi-to-graphql), load APIs.guru specifications, found [here](https://github.com/APIs-guru/openapi-directory), into the `/tmp` folder:

```bash
npm run guru-load
```

Then, run tests:

```bash
npm run guru-test <number of APIs to test at most>
```

## Similar projects

- [swagger-to-graphql](https://github.com/yarax/swagger-to-graphql) turns a given Swagger (OpenAPI Specification 2.0) into a GraphQL interface, which resolves against the original API. GraphQL schema is based on endpoints, not on data definitions. No links are considered.

- [json-to-graphql](https://github.com/aweary/json-to-graphql) turns given JSON objects / arrays into a GraphQL schema. `resolve` functions need to be provided by the user.

- [StackOverflow discussion](https://stackoverflow.com/questions/38339442/json-schema-to-graphql-schema-converters) points to the above projects.

## License

[MIT](./LICENSE.md)
