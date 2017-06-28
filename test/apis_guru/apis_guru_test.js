'use strict'

const OasGraph = require('../../index.js')
const Glob = require('glob')
const fs = require('fs')
const YAML = require('js-yaml')

/**
 * Download all OAS from APIs.guru.
 *
 * @return {Promise} Resolves on array of OAS
 */
const loadOas = () => {
  return new Promise((resolve, reject) => {
    let OASList = []
    let paths = Glob.sync('tmp/**/@(*.yaml|*.json)')
    paths.forEach(path => {
      let oas = loadFile(path)
      if (!oas) return
      if (!isValidOAS(oas)) return

      // keep track of path for later logging:
      oas['x-file-path'] = path

      OASList.push(oas)
    })
    resolve(OASList.slice(0, 3))
  })
}

/**
 * Attempts to build schema for every OAS in given list.
 */
const checkOas = (OASList) => {
  let results = {
    successes: 0,
    errors: 0
  };
  (async () => {
    for (let oas of OASList) {
      console.log(`\n\nProcess ${oas.info.title}...`)
      console.log(` (${oas['x-file-path']})\n`)
      await OasGraph.createGraphQlSchema(oas)
        .then(schema => {
          console.log(`O.k.`)
          results.successes++
        })
        .catch(e => {
          console.error(e)
          results.errors++
        })
    }

    console.log(JSON.stringify(results, null, 2))
  })()
}

/**
 * Helpers
 */
const loadFile = (path) => {
  try {
    let doc
    if (/json$/.test(path)) {
      doc = JSON.parse(fs.readFileSync(path, 'utf8'))
    } else if (/yaml$|yml$/.test(path)) {
      doc = YAML.safeLoad(fs.readFileSync(path, 'utf8'))
    }
    return doc
  } catch (e) {
    console.error('Error: failed to parse YAML/JSON: ' + e)
    return null
  }
}

const isValidOAS = (oas) => {
  return typeof oas === 'object' &&
    typeof oas.info === 'object' &&
    typeof oas.info.title === 'string' &&
    typeof oas.info.description === 'string' &&
    typeof oas.swagger === 'string' &&
    oas.swagger === '2.0'
}

// go go go:
loadOas()
  .then(checkOas)
  .catch(console.error)
