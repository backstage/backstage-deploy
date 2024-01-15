# backstage-deploy

## 0.4.0

### Minor Changes

- Remove all related quickstart functionality. Please refer to the [PR](https://github.com/backstage/backstage-deploy/pull/35) for more information.

## 0.3.2

- Remove trailing slash in container service host url if present
- Change config merge in Dockerfile template

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
