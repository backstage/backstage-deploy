/*
 * Copyright 2023 The Backstage Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import fs from 'fs-extra';
import chalk from 'chalk';
import * as awsx from '@pulumi/awsx';
import * as aws from '@pulumi/aws';
import * as pulumi from '@pulumi/pulumi';
import * as docker from '@pulumi/docker';
import { OptionValues } from 'commander';
import { resolve } from 'path';
import { Task } from '../lib/tasks';
import { Database } from '@pulumi/aws/lightsail';
import { local } from '@pulumi/command';
import { Output } from '@pulumi/pulumi';

function GetValue<T>(output: Output<T>) {
  return new Promise<T>(resolveP => {
    output.apply(value => {
      resolveP(value);
    });
  });
}

function parseOptions(optionStrings: string[]): Record<string, string> {
  const options: Record<string, string> = {};

  for (const str of optionStrings) {
    const [key] = str.split('=', 1);
    const value = str.slice(key.length + 1);
    if (!key) {
      continue;
    }
    if (str[key.length] !== '=') {
      throw new Error(
        `Invalid option '${str}', must be of the format <key>=<value>`,
      );
    }
    options[key] = value;
  }

  return options;
}

export const AWSProgram = (opts: OptionValues) => {
  return async () => {
    const envFilePath = opts.envFile === true ? './.env' : opts.envFile;
    const envs = opts.envFile
      ? (await fs.readFile(envFilePath, 'utf-8')).split('\n')
      : opts.env;
    const providedEnvironmentVariables = Object.fromEntries(
      Object.entries(parseOptions(envs)).map(([key, value]) => [
        key,
        pulumi.secret(value).apply(output => output),
      ]),
    );

    const repository = new awsx.ecr.Repository(`${opts.stack}`, {
      name: opts.stack,
      forceDelete: true,
    });

    let image: awsx.ecr.Image | undefined = undefined;
    if (opts.imageUri) {
      Task.log('Tagging existing image');
      // eslint-disable-next-line no-new
      new docker.Tag(`${opts.stack}-tag`, {
        sourceImage: opts.imageUri,
        targetImage: repository.url,
      });
      const repositoryUrl = await GetValue(repository.url);
      // eslint-disable-next-line no-new
      new local.Command('docker push', {
        create: `docker push ${repositoryUrl}`,
        update: `docker push ${repositoryUrl}`,
      });
    } else {
      if (!fs.existsSync(opts.dockerfile)) {
        throw new Error(
          `Didn't find a Dockerfile at ${opts.dockerfile}. Use --create-dockerfile to create one, --dockerfile to 
          pass in the path of an existing Dockerfile, or use --image-uri to use an existing image instead of building one.`,
        );
      }

      image = new awsx.ecr.Image(`${opts.stack}-image`, {
        repositoryUrl: repository.url,
        path: resolve('.'),
        dockerfile: opts.dockerfile,
      });
    }

    let db: Database | undefined = undefined;
    if (opts.withDb || opts.quickstart) {
      const DB_ENV_NAME = opts.quickstart
        ? 'QUICKSTART_SECRET_DATABASE_PASSWORD'
        : 'DATABASE_PASSWORD';
      if (!providedEnvironmentVariables[DB_ENV_NAME]) {
        throw new Error(`Environment variable ${DB_ENV_NAME} is not set`);
      }
      db = new aws.lightsail.Database(`${opts.stack}-database`, {
        applyImmediately: true,
        availabilityZone: opts.availabilityZone ?? 'us-east-1a',
        blueprintId: 'postgres_12',
        bundleId: 'micro_1_0',
        masterDatabaseName: `${opts.stack}`,
        masterPassword: providedEnvironmentVariables[DB_ENV_NAME],
        masterUsername: 'postgres',
        relationalDatabaseName: `${opts.stack}`,
        skipFinalSnapshot: true,
      });
    }

    // create lightsail instance
    const CONTAINER_NAME = `${opts.stack}-container`;
    const containerService = new aws.lightsail.ContainerService(
      CONTAINER_NAME,
      {
        name: `${opts.stack}-container-service`,
        isDisabled: false,
        power: opts.power,
        scale: 1,
        tags: {
          backstage: opts.stack,
        },
        privateRegistryAccess: {
          ecrImagePullerRole: {
            isActive: true,
          },
        },
      },
    );

    // create policy that allows lightsail to pull from ECR private registry
    /* eslint-disable no-new */
    new aws.ecr.RepositoryPolicy(`${opts.stack}-lightsail-ecr-policy`, {
      repository: repository.repository.name,
      policy: containerService.privateRegistryAccess.apply(
        privateRegistryAccess =>
          `{
          "Version": "2012-10-17",
          "Statement": [
            {
              "Sid": "AllowLightsailPull",
              "Effect": "Allow",
              "Principal": {
                "AWS": "${privateRegistryAccess.ecrImagePullerRole?.principalArn}"
              },
              "Action": [
                "ecr:BatchGetImage",
                "ecr:GetDownloadUrlForLayer"
              ]
            }
          ]
        }`,
      ),
    });

    const DB_ENVS: Record<string, pulumi.Output<string> | undefined> =
      opts.quickstart
        ? {
            QUICKSTART_DATABASE_HOST: db?.masterEndpointAddress,
            QUICKSTART_DATABASE_PORT: db?.masterEndpointPort.apply(v =>
              v.toString(),
            ),
            QUICKSTART_DATABASE_USER: db?.masterUsername,
            QUICKSTART_SECRET_DATABASE_PASSWORD: db?.masterPassword,
          }
        : {
            DATABASE_HOST: db?.masterEndpointAddress,
            DATABASE_PORT: db?.masterEndpointPort.apply(v => v.toString()),
            DATABASE_USER: db?.masterUsername,
            DATABASE_PASSWORD: db?.masterPassword,
          };

    const CONTAINER_SERVICE_URL = containerService.url.endsWith('/')
      ? containerService.url.slice(0, -1)
      : containerService.url;
    /* eslint-disable no-new */
    new aws.lightsail.ContainerServiceDeploymentVersion(
      `${opts.stack}-deployment`,
      {
        containers: [
          {
            containerName: CONTAINER_NAME,
            image: image ? image.imageUri : repository.url,
            commands: [],
            ports: {
              '7007': 'HTTP',
            },
            environment: {
              ...(opts.quickstart
                ? {
                    APP_CONFIG_app_baseUrl: containerService.url,
                  }
                : {
                    BACKSTAGE_HOST: CONTAINER_SERVICE_URL,
                  }),
              ...providedEnvironmentVariables,
              ...(opts.withDb || opts.quickstart ? DB_ENVS : {}),
            },
          },
        ],
        publicEndpoint: {
          containerName: CONTAINER_NAME,
          containerPort: 7007,
          healthCheck: {
            healthyThreshold: 2,
            unhealthyThreshold: 2,
            timeoutSeconds: 2,
            intervalSeconds: 5,
            path: '/',
            successCodes: '200-499',
          },
        },
        serviceName: containerService.name,
      },
    );

    containerService.url.apply(url => {
      Task.log(chalk.yellowBright(`\n\nInstance will be live at: ${url}\n\n`));
    });
  };
};
