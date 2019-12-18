rm -f ./packaged-template.yaml

cp package.json src/package.json
cp yarn.lock src/yarn.lock
cd src
yarn install --production --frozen-lockfile
cd ..

aws cloudformation package \
  --template-file ./sam-template.yaml \
  --s3-bucket sammarks-cf-templates \
  --output-template-file packaged-template.yaml

PACKAGE_VERSION=$(node -p -e "require('./package.json').version")
aws s3 cp ./packaged-template.yaml "s3://sammarks-cf-templates/video-thumbnail/$PACKAGE_VERSION/template.yaml"
aws s3 cp ./packaged-template.yaml "s3://sammarks-cf-templates/video-thumbnail/template.yaml"

rm -rf ./src/node_modules ./src/package.json ./src/yarn.lock ./packaged-template.yaml
