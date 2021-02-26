#!/bin/bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

cd "${DIR}"
cd ../../
npx lerna bootstrap
yarn install
yarn run generate-models

cd "${DIR}"
cd ../lerna
./build.sh