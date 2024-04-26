import { Construct } from 'constructs';

import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';

/**
 * ResourceProps
 */
interface ResourceProps extends cdk.StackProps {
  /**
   * @property {ec2.Vpc} vpc VPC
   */
  vpc: ec2.IVpc;
}

/**
 * Bastion作成
 */
export class Bastion extends cdk.Stack {
  /**
   * Bastion作成
   * @param {Construct} scope コンストラクト
   * @param {string} id スタック名
   * @param {ResourceProps} props 設定
   */
  constructor(scope: Construct, id: string, props: ResourceProps) {
    super(scope, id, props);

    // ECR
    const repo = new ecr.Repository(scope, 'BastionRepository', {
      repositoryName: 'bastion',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      emptyOnDelete: true,
      lifecycleRules: [
        {
          description: 'Delete one or more tagged images',
          tagStatus: ecr.TagStatus.ANY,
          maxImageCount: 2,
        },
        {
          description: 'Delete untagged images',
          tagStatus: ecr.TagStatus.UNTAGGED,
          maxImageCount: 1,
        },
      ],
    });

    // ECS Cluster
    const cluster = new ecs.Cluster(scope, 'BastionCluster', {
      clusterName: 'Bastion',
      vpc: props.vpc,
      enableFargateCapacityProviders: true,
    });

    // タスクロール
    const taskRole = new iam.Role(scope, 'BastionTaskRole', {
      // roleName: 'BastionTaskRole',
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      inlinePolicies: {
        ecsExec: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'ssmmessages:CreateControlChannel',
                'ssmmessages:CreateDataChannel',
                'ssmmessages:OpenControlChannel',
                'ssmmessages:OpenDataChannel',
              ],
              resources: ['*'],
            }),
          ],
        }),
      },
    });

    // タスク定義
    const taskDefinition = new ecs.FargateTaskDefinition(scope, 'BastionTaskDef', {
      family: 'Bastion',
      cpu: 256,
      memoryLimitMiB: 512,
      taskRole,
    });

    // ロググループ
    const logGroup = new logs.LogGroup(scope, 'BastionLogGroup', {
      logGroupName: taskDefinition.family,
      retention: logs.RetentionDays.ONE_DAY,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // コンテナ定義
    taskDefinition.addContainer('BastionContainer', {
      image: ecs.ContainerImage.fromEcrRepository(repo),
      logging: ecs.LogDrivers.awsLogs({
        logGroup,
        streamPrefix: 'ecs',
      }),
    });

    // セキュリティグループ
    const securityGroup = new ec2.SecurityGroup(scope, 'BastionSecurityGroup', {
      securityGroupName: 'BastionSecurityGroup',
      vpc: props.vpc,
    });

    // CloudFormationエクスポート
    new cdk.CfnOutput(scope, 'OutputBastionClusterName', {
      exportName: `${id}:ClusterName`,
      value: cluster.clusterName,
    });
    new cdk.CfnOutput(scope, 'OutputBastionTaskDefFamily', {
      exportName: `${id}:TaskDefFamily`,
      value: taskDefinition.family,
    });
    new cdk.CfnOutput(scope, 'OutputBastionSecurityGroupId', {
      exportName: `${id}:SecurityGroupId`,
      value: securityGroup.securityGroupId,
    });
  }
}
