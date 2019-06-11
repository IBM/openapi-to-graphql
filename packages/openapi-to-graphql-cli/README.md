![Travis (.org)](https://img.shields.io/travis/strongloop/oasgraph.svg?style=flat)
[![npm](https://img.shields.io/npm/v/openapi-to-graphql-cli.svg?style=flat)](https://www.npmjs.com/package/openapi-to-graphql-cli)
[![Join the chat at https://gitter.im/oasgraph/Lobby](https://badges.gitter.im/oasgraph/Lobby.svg?style=flat)](https://gitter.im/oasgraph/Lobby?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)

# OpenAPI-to-GraphQL CLI

Command line interface (CLI) for turning APIs described by [OpenAPI Specification (OAS)](https://github.com/OAI/OpenAPI-Specification) into [GraphQL](https://graphql.org/) interfaces.

<img src="https://raw.githubusercontent.com/strongloop/oasgraph/openapi-to-graphql/docs/translation.png" alt="Overview of translation" width="600">

_Note: To use OpenAPI-to-GraphQL as a library, refer to the [`openapi-to-graphql`](https://github.com/strongloop/oasgraph/tree/openapi-to-graphql/packages/openapi-to-graphql) package._

## Installation

```bash
npm i -g openapi-to-graphql-cli
```

## Usage

```
Usage: openapi-to-graphql <OAS JSON file path(s) and/or remote url(s)> [options]

Options:
  -V, --version                output the version number
  -p, --port <port>            select the port where the server will start
  -u, --url <url>              select the base url which paths will be built on
  -s, --strict                 throw an error if OpenAPI-to-GraphQL cannot run without compensating for errors or missing data in the OAS
  -f, --fillEmptyResponses     create placeholder schemas for operations with HTTP status code 204 (no response) rather than ignore them
  -a, --addLimitArgument       add a limit argument on fields returning lists of objects/lists that will constrain the list size
  -o, --operationIdFieldNames  create field names based on the operationId
  --cors                       enable Cross-origin resource sharing (CORS)
  --no-viewer                  do not create GraphQL viewer objects for passing authentication credentials
  --no-extensions              do not add extentions, containing information about failed REST calls, to the GraphQL errors objects
  --save <file path>           save schema to path and do not start server
  -h, --help                   output usage information
```

The basic usage of the CLI takes the specified OAS, creates a GraphQL interface for it, and starts a server to host the GraphQL interface.

```sh
openapi-to-graphql oas.json
```

You can also create a GraphQL interface using multiple OASs.

```sh
openapi-to-graphql oas.json oas2.json oas3.json
```

---

You can specify the OAS by pointing to either a local file or a remote url such as `http://127.0.0.1:3000/openapi.json`. Additionally, you can specify a port number so you can have multiple GraphQL servers running on the same machine.

```sh
openapi-to-graphql http://127.0.0.1:3000/openapi.json -p 3001
```

---

OpenAPI-to-GraphQL can also save a GraphQL schema to a local file, which you can use to inspect or change its content. Please note that the following command will not start the GraphQL server.

```sh
openapi-to-graphql oas.json --save schema.graphql
```

---

To learn more about the other options, please refer [here](https://github.com/strongloop/oasgraph/tree/openapi-to-graphql/packages/openapi-to-graphql#options).

Please note that the CLI tool is mainly used for quick testing and does not offer all the features that [`createGraphQlSchema(oas, options)`](https://github.com/strongloop/oasgraph/tree/openapi-to-graphql/packages/openapi-to-graphql#usage) does.

## License

[MIT](./LICENSE.md)
