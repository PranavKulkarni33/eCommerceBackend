const AWS = require('aws-sdk');
require('dotenv').config();

AWS.config.update({
    region: 'us-east-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

const dynamoClient = new AWS.DynamoDB.DocumentClient();
const CARTS_TABLE_NAME = "Carts";

// Add an item to the cart (or update if it exists)
const addOrUpdateCartItem = async (cartItem) => {
    const params = {
        TableName: CARTS_TABLE_NAME,
        Item: cartItem
    };
    return await dynamoClient.put(params).promise();
};

// Retrieve the cart for a specific user by email
const getCartByUserEmail = async (email) => {
    const params = {
        TableName: CARTS_TABLE_NAME,
        KeyConditionExpression: "userEmail = :email",  
        ExpressionAttributeValues: {
            ":email": email
        }
    };
    const cart = await dynamoClient.query(params).promise();  
    return cart.Items;  
};


// Delete an item from the cart by productId
const deleteCartItem = async (userEmail, productId) => {
    const params = {
        TableName: CARTS_TABLE_NAME,
        Key: {
            "userEmail": userEmail,  
            "productID": productId   
        }
    };

    return await dynamoClient.delete(params).promise();
};


module.exports = {
    addOrUpdateCartItem,
    getCartByUserEmail,
    deleteCartItem
};
