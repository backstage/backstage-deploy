# backstage-deploy

This package provides a CLI to help deploy Backstage on a specified cloud provider. It uses [Pulumi](https://www.pulumi.com) internally to create the required resources.

## Usage

With `npx`:

```sh
npx backstage-deploy aws --stack backstage-demo
```

## Documentation

- [Deploy documentation](https://backstage.io/docs/deployment/backstage-deploy/aws-lightsail)

## Install PNPM

`backstage-deploy` doesn't use Yarn but PNPM. Please refer to the [install documentation](https://pnpm.io/installation).

After installation, run this command to install the dependencies:

```sh
pnpm i
```
