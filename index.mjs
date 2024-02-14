import request from 'request-promise';
import OAuth from 'oauth-1.0a';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import AWS from 'aws-sdk';

const dynamo_db = new AWS.DynamoDB.DocumentClient();
const table_name = 'partner_connections';

export async function handler(event) {
    console.log("Received event:", JSON.stringify(event)); // Log the incoming event

    const oauth = OAuth({
        consumer: {
            key: '72d9de28-9936-4fe8-9cd6-52f4b5e4fbdd',
            secret: 'VYSqkvdwyhMZxVJwzjb17sBOZPz6CAAnffe'
        },
        signature_method: 'HMAC-SHA1',
        hash_function(base_string, key) {
            return crypto.createHmac('sha1', key).update(base_string).digest('base64');
        }
    });

    const jwt_token = event.headers.Authorization || event.headers.authorization;
    let user_id;

    try {
        const decoded_jwt = jwt.decode(jwt_token);
        user_id = decoded_jwt.sub;
        console.log("Decoded JWT user ID:", user_id); // Log the decoded user ID
    } catch (error) {
        console.error("Error decoding JWT:", error);
        return {
            statusCode: 400,
            headers: get_headers(),
            body: JSON.stringify({ error: "Error decoding JWT" })
        };
    }

    try {
        const oauth_request_data = {
            url: 'https://connectapi.garmin.com/oauth-service/oauth/request_token',
            method: 'POST',
            data: {}
        };

        const oauth_headers = oauth.toHeader(oauth.authorize(oauth_request_data));
        console.log("OAuth headers:", JSON.stringify(oauth_headers)); // Log the OAuth headers

        const garmin_response_string = await request({
            url: oauth_request_data.url,
            method: oauth_request_data.method,
            headers: oauth_headers
        });

        console.log("Garmin response string:", garmin_response_string);

        const garmin_response = parse_response(garmin_response_string);
        console.log("Parsed Garmin response:", JSON.stringify(garmin_response));

        const { oauth_token, oauth_token_secret } = garmin_response;
        const redirect_url = `https://connect.garmin.com/oauthConfirm?oauth_token=${encodeURIComponent(oauth_token)}`;
        console.log("Redirect URL:", redirect_url);
        console.log("Garmin Token Secret:", oauth_token_secret);

        // Insert the Garmin Token Secret into DynamoDB for the corresponding user ID
        await update_dynamo_db(user_id, oauth_token_secret);

        return {
            statusCode: 200,
            headers: get_headers(),
            body: JSON.stringify({ redirect_url, user_id })
        };
    } catch (error) {
        console.error("Error requesting token from Garmin:", error);
        return {
            statusCode: error.statusCode || 500,
            headers: get_headers(),
            body: JSON.stringify({ error: "Error requesting token from Garmin" })
        };
    }
}

function get_headers() {
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
        "Access-Control-Allow-Methods": "OPTIONS,POST"
    };
}

function parse_response(response_string) {
    return response_string.split('&').reduce((acc, part) => {
        const [key, value] = part.split('=');
        acc[key] = value;
        return acc;
    }, {});
}

async function update_dynamo_db(user_id, garmin_token_secret) {
    const params = {
        TableName: table_name,
        Item: {
            user_id: user_id, // Primary key
            partner: 'garmin', // Sort key
            partner_temp_token_secret: garmin_token_secret // Column you want to set
        }
    };

    await dynamo_db.put(params).promise();
}