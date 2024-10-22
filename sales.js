const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

// Configure AWS credentials
AWS.config.update({
    region: 'us-east-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

const dynamoClient = new AWS.DynamoDB.DocumentClient();
const SALES_TABLE_NAME = "sales";

// Add or update a sale record
const addOrUpdateSale = async (saleDetails) => {
    if (!saleDetails.salesId) {
        saleDetails.salesId = uuidv4();
    }
    const params = {
        TableName: SALES_TABLE_NAME,
        Item: saleDetails
    };
    return await dynamoClient.put(params).promise();
};


// Retrieve sales for a specific user by email
const getSalesByUserEmail = async (email) => {
    const params = {
        TableName: SALES_TABLE_NAME,
        IndexName: 'userEmail-index', // Ensure this index exists in your DynamoDB table
        KeyConditionExpression: "userEmail = :email",  
        ExpressionAttributeValues: {
            ":email": email
        }
    };
    const sales = await dynamoClient.query(params).promise();
    return sales.Items;
};

// Retrieve all sales for the admin
const getAllSales = async () => {
    const params = {
        TableName: SALES_TABLE_NAME
    };
    const sales = await dynamoClient.scan(params).promise();
    return sales.Items;
};

// Delete a sale record by saleId
const deleteSaleById = async (saleId) => {
    const params = {
        TableName: SALES_TABLE_NAME,
        Key: {
            "saleId": saleId
        }
    };
    return await dynamoClient.delete(params).promise();
};

module.exports = {
    addOrUpdateSale,
    getSalesByUserEmail,
    getAllSales,
    deleteSaleById
};
