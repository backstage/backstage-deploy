# backstage-deploy

## 0.3.1

### Patch Changes

- Also pushes Docker image in pulumi update phase
- Change NodeJS base docker image

## 0.3.0

### Minor Changes

- - Added support for `--image-uri` flag
  - Added support for `--with-db` flag
  - Added support for `--quickstart` flag

## 0.2.0

### Minor Changes

- Added support for `--power` flag to specify the power tier of your lightsail
  container service
- Added support for `--env-file` flag, to read environment variables from file
- Fixed bug where the app needed to be built when destroying all the resources

## 0.1.1

### Patch Changes

- Bump tough-cookie and protobufjs to address sec vuln

## 0.1.0

### Minor Changes

- 809a04b: Release Backstage Deploy
