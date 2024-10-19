const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid'); // Import uuid for auto-generating IDs
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

// Get products from the database
const getProducts = async () => {
    const params = {
        TableName: TABLE_NAME
    };
    const products = await dynamoClient.scan(params).promise();
    return products;
};

// Get product by ID from the database
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

// Add or update the product, auto-generate ID if not present
const addOrUpdateProduct = async (product) => {
    if (!product.id) {
        product.id = uuidv4(); // Auto-generate ID if not provided
    }

    const params = {
        TableName: TABLE_NAME,
        Item: product
    };
    return await dynamoClient.put(params).promise();
};

// Delete product by ID from DynamoDB and remove associated images from S3
const deleteProductsById = async (id) => {
    // First, get the product to retrieve the image URLs
    const product = await getProductsById(id);
    if (product && product.Item && product.Item.images) {
        // Delete each image associated with the product
        for (const imageUrl of product.Item.images) {
            const imageKey = imageUrl.split('/').pop(); // Extract image key from the S3 URL
            const s3DeleteParams = {
                Bucket: BUCKET_NAME,
                Key: imageKey
            };
            await s3.deleteObject(s3DeleteParams).promise();
        }
    }

    // Now delete the product from DynamoDB
    const params = {
        TableName: TABLE_NAME,
        Key: {
            id
        }
    };
    return await dynamoClient.delete(params).promise();
};

// Upload images to S3 and get their URLs
const uploadImagesToS3 = async (files) => {
    const imageUrls = [];
    for (const file of files) {
        const params = {
            Bucket: BUCKET_NAME,
            Key: `${file.originalname}`,
            Body: file.buffer,
            ContentType: file.mimetype
        };

        const uploadResult = await s3.upload(params).promise();
        imageUrls.push(uploadResult.Location); // Push the uploaded image URL to the array
    }
    return imageUrls;
};

module.exports = {
    dynamoClient,
    getProducts,
    getProductsById,
    addOrUpdateProduct,
    deleteProductsById,
    uploadImagesToS3
};
