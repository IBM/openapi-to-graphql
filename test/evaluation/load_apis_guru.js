'use strict'

const Git = require('nodegit')
const rimraf = require('rimraf')

const REPO_URL = 'https://github.com/APIs-guru/openapi-directory'
const FOLDER_PATH = 'tmp'

/**
 * Download all OAS from APIs.guru.
 *
 * @return {Promise} Resolves on array of OAS
 */
const downloadOas = () => {
  return new Promise((resolve, reject) => {
    Git.Clone(REPO_URL, FOLDER_PATH)
      .then(repo => {
        return repo.getCurrentBranch()
      })
      .then(branch => {
        resolve()
      })
      .catch(reject)
  })
}

/**
 * Helpers
 */
const emptyTmp = () => {
  rimraf.sync(FOLDER_PATH)
}

// go go go:
emptyTmp()
downloadOas()
  .then(() => {
    console.log(`Loaded files from ${REPO_URL} to ${FOLDER_PATH}`)
  })
  .catch(console.error)
