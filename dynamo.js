const AWS = require('aws-sdk');
const s3 = new AWS.S3();

require('dotenv').config();

AWS.config.update({
    region: 'us-east-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

const dynamoClient = new AWS.DynamoDB.DocumentClient();
const TABLE_NAME = "products";
const BUCKET_NAME = "pebble-studios-product-images";

const getProducts = async () => {
    const params = {
        TableName: TABLE_NAME
    };
    const products = await dynamoClient.scan(params).promise();
    return products;
};

const getProductsById = async (id) => {
    const params = {
        TableName: TABLE_NAME,
        Key: {
            id
        }
    };
    const product = await dynamoClient.get(params).promise();
    return product;
};

const addOrUpdateProduct = async (product) => {
    const params = {
        TableName: TABLE_NAME,
        Item: product
    };
    return await dynamoClient.put(params).promise();
};

const deleteProductsById = async (id) => {
    const params = {
        TableName: TABLE_NAME,
        Key: {
            id
        }
    };
    const product = await dynamoClient.delete(params).promise();
    return product;
};

const uploadImageToS3 = async (file) => {
    const params = {
        Bucket: BUCKET_NAME,
        Key: `${file.originalname}`, 
        Body: file.buffer,
        ContentType: file.mimetype
    };

    const uploadResult = await s3.upload(params).promise();
    return uploadResult.Location; 
};


module.exports = {
    dynamoClient,
    getProducts,
    getProductsById,
    addOrUpdateProduct,
    deleteProductsById,
    uploadImageToS3
};
