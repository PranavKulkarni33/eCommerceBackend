const express = require('express');
const multer = require('multer');
const { getProducts, getProductsById, addOrUpdateProduct, deleteProductsById, uploadImagesToS3 } = require('./dynamo');
const { addOrUpdateCartItem, getCartByUserEmail, deleteCartItem } = require('./cart');
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

// All APIs for Products

// Get all products
app.get('/products', async (req, res) => {
    try {
        const products = await getProducts();
        res.json(products);
    } catch (err) {
        console.error(err);
        res.status(500).json({ err: "Something went wrong!" });
    }
});

// Get product by id
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

// Handle file upload and product data, max 5 images
app.post('/products', upload.array('images', 5), async (req, res) => {
    try {
        const product = JSON.parse(req.body.product); // Parse product data from the request body
        const files = req.files; // Get the uploaded image files
        
        // Check if more than 5 images are uploaded
        if (files.length > 5) {
            return res.status(400).json({ err: "You can upload a maximum of 5 images." });
        }

        // Upload images to S3 and get their URLs
        const imageUrls = await uploadImagesToS3(files);
        product.images = imageUrls;

        // Add or update product
        const newProduct = await addOrUpdateProduct(product);
        res.json(newProduct);
    } catch (err) {
        console.error(err);
        res.status(500).json({ err: "Something went wrong!" });
    }
});

// Update product
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

// Delete product and its images
app.delete('/products/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await deleteProductsById(id);
        res.json({ message: "Product and images deleted successfully" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ err: "Something went wrong!" });
    }
});

// All APIs for Cart Manipulation

// Add or update a cart item
app.post('/cart', async (req, res) => {
    const cartItem = req.body;
    try {
        await addOrUpdateCartItem(cartItem);
        res.json({ message: "Cart item added/updated successfully" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ err: "Something went wrong!" });
    }
});

// Get the cart for a user
app.get('/cart/:email', async (req, res) => {
    const { email } = req.params;
    try {
        const cart = await getCartByUserEmail(email);
        res.json(cart);
    } catch (err) {
        console.error(err);
        res.status(500).json({ err: "Something went wrong!" });
    }
});

// Delete a cart item
app.delete('/cart/:email/:productId', async (req, res) => {
    const { email, productId } = req.params;
    try {
        await deleteCartItem(email, productId);
        res.json({ message: "Cart item deleted successfully" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ err: "Something went wrong!" });
    }
});
