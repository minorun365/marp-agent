import type { CloudFormationCustomResourceEvent, CloudFormationCustomResourceResponse } from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  CreateIdentityProviderCommand,
  DeleteIdentityProviderCommand,
  UpdateIdentityProviderCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { createHash, createHmac } from 'node:crypto';

const cognito = new CognitoIdentityProviderClient({});
const providerName = 'Google';

type ResourceProperties = {
  UserPoolId: string;
  ClientId: string;
  SecretName: string;
  Scopes: string;
};

async function sendResponse(
  event: CloudFormationCustomResourceEvent,
  status: 'SUCCESS' | 'FAILED',
  reason?: string,
) {
  const body: CloudFormationCustomResourceResponse = {
    Status: status,
    Reason: reason ?? `See CloudWatch log stream for request ${event.RequestId}`,
    PhysicalResourceId: `${event.ResourceProperties.UserPoolId}|${providerName}`,
    StackId: event.StackId,
    RequestId: event.RequestId,
    LogicalResourceId: event.LogicalResourceId,
    NoEcho: true,
    Data: { ProviderName: providerName },
  };
  const responseBody = JSON.stringify(body);
  const response = await fetch(event.ResponseURL, {
    method: 'PUT',
    headers: {
      'content-type': '',
      'content-length': Buffer.byteLength(responseBody).toString(),
    },
    body: responseBody,
  });
  if (!response.ok) throw new Error(`Custom resource response failed: ${response.status}`);
}

async function upsertProvider(properties: ResourceProperties) {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const sessionToken = process.env.AWS_SESSION_TOKEN;
  if (!accessKeyId || !secretAccessKey) {
    throw new Error('Lambda execution credentials are unavailable.');
  }
  const region = process.env.AWS_REGION || 'us-east-1';
  const host = `secretsmanager.${region}.amazonaws.com`;
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const target = 'secretsmanager.GetSecretValue';
  const payload = JSON.stringify({ SecretId: properties.SecretName });
  const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
  const payloadHash = sha256(payload);
  const headers: Record<string, string> = {
    'content-type': 'application/x-amz-json-1.1',
    host,
    'x-amz-date': amzDate,
    'x-amz-target': target,
    ...(sessionToken ? { 'x-amz-security-token': sessionToken } : {}),
  };
  const signedHeaders = Object.keys(headers).sort().join(';');
  const canonicalHeaders = Object.keys(headers).sort().map((key) => `${key}:${headers[key]}\n`).join('');
  const canonicalRequest = ['POST', '/', '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const credentialScope = `${dateStamp}/${region}/secretsmanager/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, sha256(canonicalRequest)].join('\n');
  const hmac = (key: string | Buffer, value: string) => createHmac('sha256', key).update(value).digest();
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${secretAccessKey}`, dateStamp), region), 'secretsmanager'), 'aws4_request');
  const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');
  headers.authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  const secretResponse = await fetch(`https://${host}/`, { method: 'POST', headers, body: payload });
  if (!secretResponse.ok) throw new Error(`Secrets Manager request failed: ${secretResponse.status}`);
  const secret = await secretResponse.json() as { SecretString?: string };
  if (!secret.SecretString) throw new Error('Google OAuth client secret is empty.');
  const clientSecret = secret.SecretString.trim();
  const googleSecretPrefixCount = clientSecret.match(/GOCSPX-/g)?.length ?? 0;
  if (googleSecretPrefixCount !== 1) {
    throw new Error('Google OAuth client secret must contain exactly one client secret.');
  }

  const input = {
    UserPoolId: properties.UserPoolId,
    ProviderName: providerName,
    ProviderDetails: {
      client_id: properties.ClientId,
      client_secret: clientSecret,
      authorize_scopes: properties.Scopes,
    },
    AttributeMapping: {
      email: 'email',
      given_name: 'given_name',
      family_name: 'family_name',
    },
  };

  try {
    await cognito.send(new UpdateIdentityProviderCommand(input));
  } catch (error) {
    if (!(error instanceof Error) || error.name !== 'ResourceNotFoundException') throw error;
    await cognito.send(new CreateIdentityProviderCommand({
      ...input,
      ProviderType: 'Google',
    }));
  }
}

async function deleteProvider(userPoolId: string) {
  try {
    await cognito.send(new DeleteIdentityProviderCommand({ UserPoolId: userPoolId, ProviderName: providerName }));
  } catch (error) {
    if (!(error instanceof Error) || error.name !== 'ResourceNotFoundException') throw error;
  }
}

export const handler = async (event: CloudFormationCustomResourceEvent) => {
  try {
    const properties = event.ResourceProperties as ResourceProperties;
    if (event.RequestType === 'Delete') {
      await deleteProvider(properties.UserPoolId);
    } else {
      await upsertProvider(properties);
    }
    await sendResponse(event, 'SUCCESS');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    await sendResponse(event, 'FAILED', message);
  }
};
