import { Stack, StackProps, CfnResource, SecretValue } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';

interface ActivatorStackProps extends StackProps {
  apiBaseUrl: string;
  apiKey: string;
  apiSecret: string;
  schemaHandlerPackageS3Uri?: string;
}

/**
 * CDK Stack that activates the Chaim::DynamoDB::Binding CloudFormation Registry type.
 * 
 * This stack:
 * 1. Creates a Secrets Manager secret for API credentials
 * 2. Creates an execution role for the CloudFormation Registry type
 * 3. Activates the Chaim::DynamoDB::Binding type in the CloudFormation Registry
 */
export class ActivatorStack extends Stack {
  constructor(scope: Construct, id: string, props: ActivatorStackProps) {
    super(scope, id, props);

    // 1. Create Secrets Manager secret for API credentials
    const apiCredentialsSecret = new secretsmanager.Secret(this, 'ChaimApiCredentials', {
      secretName: 'chaim/api-credentials',
      description: 'API credentials for Chaim SaaS platform',
      secretObjectValue: {
        apiBaseUrl: SecretValue.unsafePlainText(props.apiBaseUrl),
        apiKey: SecretValue.unsafePlainText(props.apiKey),
        apiSecret: SecretValue.unsafePlainText(props.apiSecret),
      },
    });

    // 2. Create an execution role for the CloudFormation Registry type
    const providerExecutionRole = new iam.Role(this, 'ChaimProviderExecutionRole', {
      assumedBy: new iam.ServicePrincipal('resources.cloudformation.amazonaws.com'),
      description: 'Execution role for Chaim::DynamoDB::Binding CloudFormation Registry Type',
    });

    // Grant read access to the secret
    apiCredentialsSecret.grantRead(providerExecutionRole);

    // Grant necessary permissions for the provider to interact with DynamoDB and other services
    providerExecutionRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'dynamodb:CreateTable',
        'dynamodb:UpdateTable',
        'dynamodb:DeleteTable',
        'dynamodb:DescribeTable',
        'dynamodb:TagResource',
        'dynamodb:UntagResource',
        'kms:Decrypt',
      ],
      resources: ['*'],
    }));

    // If a schema handler package S3 URI is provided, grant read access to it
    if (props.schemaHandlerPackageS3Uri) {
      const s3UriParts = props.schemaHandlerPackageS3Uri.match(/s3:\/\/([^/]+)\/(.*)/);
      if (s3UriParts) {
        const bucketName = s3UriParts[1];
        const objectKey = s3UriParts[2];
        const bucket = s3.Bucket.fromBucketName(this, 'SchemaHandlerBucket', bucketName);
        bucket.grantRead(providerExecutionRole, objectKey);
      }
    }

    // 3. Activate the Chaim::DynamoDB::Binding CloudFormation Registry type
    new CfnResource(this, 'ChaimDynamoDBBindingTypeActivation', {
      type: 'AWS::CloudFormation::TypeActivation',
      properties: {
        TypeName: 'Chaim::DynamoDB::Binding',
        Type: 'RESOURCE',
        ExecutionRoleArn: providerExecutionRole.roleArn,
        PublicTypeArn: `arn:aws:cloudformation:${this.region}::type/resource/Chaim-DynamoDB-Binding`,
      },
    });
  }
}
