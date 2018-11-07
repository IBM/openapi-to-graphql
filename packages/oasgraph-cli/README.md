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
The basic usage of the CLI takes the specified OAS, create a GraphQL interface for it, and start a server to host the GraphQL interface.

You can specify a local file containing the OAS specification or a remote url such as `http://127.0.0.1:3000/openapi.json`. Additionally, you can specify an optional port number so you can have multiple GraphQL servers for testing in the same machine.

```sh
oasgraph <OAS JSON file path or remote url> [port number]
```

To create the CLI tool, run:
```sh
npm link
```

Please note that the CLI tool is mainly used for quick testing and does not offer all the features that `createGraphQlSchema(oas, options)` does.

***

OASgraph can also generate and save the GraphQL schema to the local file `schema.graphql`, which you can use later to inspect or change its content. Please note that the following command will not start the GraphQL server.

```sh
oasgraph <OAS JSON file path or remote url> --save
```


## License
[MIT](./LICENSE.md)