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

/**
 * CLI for Backstage deploy tooling
 *
 * @packageDocumentation
 */

import { Option, program } from 'commander';
import { exitWithError } from './lib/errors';
import { version } from '../package.json';
import { resolve } from 'path';
import deploy from './deploy';
import findProcess from 'find-process';

const main = (argv: string[]) => {
  program
    .command('aws')
    .version(version)
    .description('Deploys Backstage on AWS Lightsail')
    .option(
      '--dockerfile <path>',
      'path of dockerfile',
      resolve('./Dockerfile'),
    )
    .option(
      '--create-dockerfile',
      'creates a Dockerfile in the root of the project',
      false,
    )
    .option('--stack <name>', 'name of the stack', 'backstage')
    .option('--destroy', 'name of the stack to destroy', false)
    .option('--region <region>', 'region of your aws console', 'us-east-1')
    .option('--skip-build', 'option to skip the tsc and build process', false)
    .option(
      '--env <name>=<value>',
      'Pass in environment variables to use at run time',
      (env, arr: string[]) => [...arr, env],
      [],
    )
    .addOption(
      new Option(
        '--power <power>',
        'power tier of your container service deployment',
      )
        .choices(['nano', 'micro', 'small', 'medium', 'large', 'xlarge'])
        .default('small'),
    )
    .addOption(
      new Option(
        '--availabilityZone <availabilityZone>',
        'Availability zone of your database',
      )
        .choices([
          'eu-central-1a',
          'eu-west-1a',
          'eu-west-2a',
          'eu-west-3a',
          'eu-north-1a',
          'ap-south-1a',
          'ca-central-1a',
          'us-east-1a',
          'us-east-2a',
          'ap-southeast-1a',
          'app-southeast-2a',
          'ap-northeast-1a',
          'us-west-2a',
          'ap-southeast-2a',
        ])
        .default('us-east-1a'),
    )
    .option(
      '--env-file [path]',
      'read environment variables from file',
      './.env',
    )
    .option('--with-db', 'Deploy a Backstage instance with a database', false)
    .option('--quickstart', 'Deploys a quickstart instance', false)
    .action(cmd => deploy(cmd));

  program.parse(argv);
};

// currently have an issue where the node process exits
// before the Pulumi process is finished
// which keeps the state file locked
async function waitForPulumiToBeFinished() {
  let pulumiIsFinished = false;
  while (!pulumiIsFinished) {
    const proc = await findProcess('name', 'pulumi', true);
    if (proc.length === 0) {
      pulumiIsFinished = true;
    }
  }
}

process.on('unhandledRejection', async rejection => {
  await waitForPulumiToBeFinished();
  if (rejection instanceof Error) {
    exitWithError(rejection);
  } else {
    exitWithError(new Error(`Unknown rejection: '${rejection}'`));
  }
});

main(process.argv);
