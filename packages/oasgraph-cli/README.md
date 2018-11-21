![Travis (.org)](https://img.shields.io/travis/strongloop/oasgraph.svg?style=flat)
[![npm](https://img.shields.io/npm/v/oasgraph-cli.svg?style=flat)](https://www.npmjs.com/package/oasgraph-cli)
[![Join the chat at https://gitter.im/oasgraph/Lobby](https://badges.gitter.im/oasgraph/Lobby.svg?style=flat)](https://gitter.im/oasgraph/Lobby?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)


# OASGraph CLI
Command line interface (CLI) for turning APIs described by [OpenAPI Specification (OAS)](https://github.com/OAI/OpenAPI-Specification) into [GraphQL](https://graphql.org/) interfaces.

<img src="https://raw.githubusercontent.com/strongloop/oasgraph/master/docs/translation.png" alt="Overview of translation" width="600">

_Note: To use OASGraph as a library, refer to the [`oasgraph`](https://github.com/strongloop/oasgraph/tree/master/packages/oasgraph) package._


## Installation

```bash
npm i -g oasgraph-cli
```


## Usage

```
Usage: oasgraph <OAS JSON file path or remote url> [options]

Options:
  -V, --version             output the version number
  -p, --port <port>         select the port where the server will start
  -s, --strict              throw an error if OASGraph cannot run without compensating for errors or missing data in the OAS
  -a, --addSubOperations    nest operations based on path hierarchy
  -f, --fillEmptyResponses  create placeholder schemas for operations with HTTP status code 204 (no response) rather than ignore them
  --no-viewer               do not create GraphQL viewer objects for passing authentication credentials
  --save <file path>        save schema to path and do not start server
  -h, --help                output usage information
```

The basic usage of the CLI takes the specified OAS, creates a GraphQL interface for it, and starts a server to host the GraphQL interface.

```sh
oasgraph oas.json
```

***

You can specify the OAS by pointing to either a local file or a remote url such as `http://127.0.0.1:3000/openapi.json`. Additionally, you can specify a port number so you can have multiple GraphQL servers running on the same machine.

```sh
oasgraph http://127.0.0.1:3000/openapi.json -p 3001
```

***

OASgraph can also save a GraphQL schema to a local file, which you can use to inspect or change its content. Please note that the following command will not start the GraphQL server.

```sh
oasgraph oas.json --save schema.graphql
```

***

To learn more about the other options, please refer [here](https://github.com/strongloop/oasgraph/tree/master/packages/oasgraph#options).

Please note that the CLI tool is mainly used for quick testing and does not offer all the features that [`createGraphQlSchema(oas, options)`](https://github.com/strongloop/oasgraph/tree/master/packages/oasgraph#usage) does.


## License
[MIT](./LICENSE.md)