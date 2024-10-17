const express = require('express');
const multer = require('multer');
const { getProducts, getProductsById, addOrUpdateProduct, deleteProductsById, uploadImageToS3 } = require('./dynamo');
const app = express();
const cors = require('cors');

app.use(express.json());
app.use(cors());
app.use(express.urlencoded({ extended: true }));

const port = 3000;

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

app.listen(port, () => {
    console.log(`Listening on port ` + port);
});

app.get('/', (req, res) => {
    res.send('Server is live!');
});

app.get('/products', async (req, res) => {
    try {
        const products = await getProducts();
        res.json(products);
    } catch (err) {
        console.error(err);
        res.status(500).json({ err: "Something went wrong!" });
    }
});

app.get('/products/:id', async (req, res) => {
    const id = req.params.id;
    try {
        const product = await getProductsById(id);
        res.json(product);
    } catch (err) {
        console.error(err);
        res.status(500).json({ err: "Something went wrong!" });
    }
});

// Handle file upload and product data
app.post('/products', upload.single('image'), async (req, res) => {
    try {
        const product = JSON.parse(req.body.product); // Parse product data sent as text in form-data
        const image = req.file;  // Get the image file

        // Upload image to S3 and get the URL
        const imageUrl = await uploadImageToS3(image);

        // Add the image URL to the product data
        product.images = [imageUrl];

        // Insert the product with the image URL into DynamoDB
        const newProduct = await addOrUpdateProduct(product);
        res.json(newProduct);
    } catch (err) {
        console.error(err);
        res.status(500).json({ err: "Something went wrong!" });
    }
});

app.put('/products/:id', async (req, res) => {
    const product = req.body;
    const { id } = req.params;
    product.id = id;
    try {
        const updatedProduct = await addOrUpdateProduct(product);
        res.json(updatedProduct);
    } catch (err) {
        console.error(err);
        res.status(500).json({ err: "Something went wrong!" });
    }
});

app.delete('/products/:id', async (req, res) => {
    const { id } = req.params;
    try {
        res.json(await deleteProductsById(id));
    } catch (err) {
        console.error(err);
        res.status(500).json({ err: "Something went wrong!" });
    }
});
