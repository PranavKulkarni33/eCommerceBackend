const express = require('express');
require('dotenv').config();
const multer = require('multer');
const bodyParser = require('body-parser');
const AWS = require('aws-sdk'); 
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { getProducts, getProductsById, addOrUpdateProduct, deleteProductsById, uploadImagesToS3 } = require('./dynamo');
const { addOrUpdateCartItem, getCartByUserEmail, deleteCartItem } = require('./cart');
const { addOrUpdateSale, getSalesByUserEmail, getAllSales, deleteSaleById } = require('./sales');
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
const app = express();
const cors = require('cors');

app.use(cors());
app.use(express.urlencoded({ extended: true }));

// AWS Cognito Configuration
const cognito = new AWS.CognitoIdentityServiceProvider({
    region: 'us-east-1', // Adjust your region as needed
});

// Helper function to fetch shipping address from Cognito
const getCognitoUserAttributes = async (email) => {
    const params = {
        UserPoolId: process.env.COGNITO_USER_POOL_ID,
        Filter: `email = "${email}"`,
    };

    const data = await cognito.listUsers(params).promise();
    if (!data.Users.length) throw new Error("User not found");

    const attributes = {};
    data.Users[0].Attributes.forEach(attr => {
        attributes[attr.Name] = attr.Value;
    });

    return {
        name: attributes['name'] || "Customer",
        shippingAddress: attributes['custom:shippingAddress'] || "N/A",
    };
};

// Webhook route
app.post('/webhook', bodyParser.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err) {
        console.error('Webhook signature verification failed:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;

        const shippingDetails = session.shipping_details?.address || 'N/A';
        const lineItems = await stripe.checkout.sessions.listLineItems(session.id);

        const productsSold = lineItems.data.map(item => ({
            productName: item.description,
            quantity: item.quantity,
            price: item.amount_total / 100,
        }));

        const saleDetails = {
            userEmail: session.customer_email,
            totalAmount: session.amount_total / 100,
            currency: session.currency,
            paymentStatus: 'paid',
            shippingAddress: shippingDetails,
            timestamp: new Date().toISOString(),
            products: productsSold,
        };

        try {
            await addOrUpdateSale(saleDetails);
        } catch (err) {
            console.error('Error recording sale:', err);
        }
    }

    res.json({ received: true });
});



app.use(express.json());


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

// All APIs for Sales

// Add or update a sale
app.post('/sales', async (req, res) => {
    const saleDetails = req.body;
    try {
        await addOrUpdateSale(saleDetails);
        res.json({ message: "Sale recorded successfully" });
    } catch (err) {
        console.error('Error adding sale:', err);
        res.status(500).json({ err: "Something went wrong!" });
    }
});

// Get all sales (admin)
app.get('/sales', async (req, res) => {
    try {
        const sales = await getAllSales();
        res.json(sales);
    } catch (err) {
        console.error('Error fetching sales:', err);
        res.status(500).json({ err: "Something went wrong!" });
    }
});

// Delete a sale by ID
app.delete('/sales/:saleId', async (req, res) => {
    const { saleId } = req.params;
    try {
        await deleteSaleById(saleId);
        res.json({ message: "Sale deleted successfully" });
    } catch (err) {
        console.error('Error deleting sale:', err);
        res.status(500).json({ err: "Something went wrong!" });
    }
});

// Get all sales
app.get('/sales', async (req, res) => {
    try {
        const sales = await getAllSales();
        res.json(sales);
    } catch (err) {
        console.error('Error fetching sales:', err);
        res.status(500).json({ err: "Something went wrong!" });
    }
});


// Stripe Checkout Session creation
app.post('/create-checkout-session', async (req, res) => {
    const { cartItems, customerEmail } = req.body;

    try {
        // Fetch user attributes from Cognito
        const { name, shippingAddress } = await getCognitoUserAttributes(customerEmail);

        // Create customer in Stripe
        const customer = await stripe.customers.create({
            email: customerEmail,
            name: name,
            shipping: {
                name: name,
                address: {
                    line1: shippingAddress,
                    country: 'CA',
                },
            },
        });

        // Build line items for Stripe Checkout
        const lineItems = cartItems.map(item => ({
            price_data: {
                currency: 'cad',
                product_data: { name: item.productName },
                unit_amount: Math.round((item.price + item.price * 0.13) * 100),
            },
            quantity: item.quantity,
        }));

        // Create Stripe Checkout session
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: lineItems,
            mode: 'payment',
            customer: customer.id,
            success_url: `${process.env.FRONTEND_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.FRONTEND_URL}/cancel`,
            shipping_address_collection: { allowed_countries: ['CA', 'US'] },
        });

        res.json({ id: session.id, url: session.url });
    } catch (error) {
        console.error('Error creating Stripe session:', error);
        res.status(500).json({ error: 'Failed to create Stripe session' });
    }
});




