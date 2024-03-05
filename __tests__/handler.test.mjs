import { handler } from '../index.mjs'; 
import request from 'request-promise';
import jwt from 'jsonwebtoken';
import AWS from 'aws-sdk';

jest.mock('request-promise');
jest.mock('jsonwebtoken');
jest.mock('aws-sdk', () => {
    // This is to mock the promise returned by put().promise()
    const putPromise = jest.fn().mockResolvedValue(true); 
    // This makes put a mock function
    const putMock = jest.fn(() => ({ promise: putPromise }));
  
    return {
      DynamoDB: {
        DocumentClient: jest.fn(() => ({
          // Now put is a Jest mock function
          put: putMock 
        }))
      }
    };
  });
  

describe('handler function', () => {
    it('should successfully decode JWT, make OAuth request, and update DynamoDB', async () => {
    const event = {
      headers: {
        authorization: 'Bearer jwt-token'
      }
    };
    
    jwt.decode.mockReturnValue({ sub: 'user-id' });
    request.mockResolvedValue('oauth_token=token&oauth_token_secret=secret');
    const dynamoDBClient = new AWS.DynamoDB.DocumentClient();

    const response = await handler(event);
    await handler(event);

    // Assuming AWS.DynamoDB.DocumentClient is called once and its put method is called once,
    // access the mock function like this:
    const putMock = dynamoDBClient.put;
    expect(putMock).toHaveBeenCalledWith({
      TableName: 'partner_connections',
      Item: {
        user_id: 'user-id',
        partner: 'garmin',
        partner_temp_token_secret: 'secret'
      }
    });
    expect(response).toEqual({
        statusCode: 200,
        headers: expect.anything(), // This is fine since you're not testing headers specifically
        body: JSON.stringify({
          redirect_url: `https://connect.garmin.com/oauthConfirm?oauth_token=token`, 
          user_id: 'user-id' 
        })
      });      
  });

  it('should return an error if JWT decoding fails', async () => {
    const event = {
      headers: {
        authorization: 'Bearer invalid-jwt-token'
      }
    };
    jwt.decode.mockReturnValue(null); // Simulate failed JWT decoding
  
    const response = await handler(event);
  
    expect(response).toEqual({
      statusCode: 400,
      headers: expect.anything(),
      body: JSON.stringify({ error: "Error decoding JWT" })
    });
  });
  it('should return an error if OAuth request fails', async () => {
    const event = {
      headers: {
        authorization: 'Bearer valid-jwt-token'
      }
    };
    jwt.decode.mockReturnValue({ sub: 'user-id' });
    request.mockRejectedValue({ statusCode: 500 }); // Simulate OAuth request failure
  
    const response = await handler(event);
  
    expect(response).toEqual({
      statusCode: 500,
      headers: expect.anything(),
      body: JSON.stringify({ error: "Error requesting token from Garmin" })
    });
  });
});
