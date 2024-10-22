const express = require('express');
require('dotenv').config();
const multer = require('multer');
const bodyParser = require('body-parser');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { getProducts, getProductsById, addOrUpdateProduct, deleteProductsById, uploadImagesToS3 } = require('./dynamo');
const { addOrUpdateCartItem, getCartByUserEmail, deleteCartItem } = require('./cart');
const { addOrUpdateSale, getSalesByUserEmail, getAllSales, deleteSaleById } = require('./sales');
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
const app = express();
const cors = require('cors');

app.use(cors());
app.use(express.urlencoded({ extended: true }));

// Webhook route
app.post('/webhook', bodyParser.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
        // Verify the webhook signature
        event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err) {
        console.error('Webhook signature verification failed:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the event
    switch (event.type) {
        case 'checkout.session.completed':
            const session = event.data.object;

            // Extract shipping details from the session
            const shippingDetails = session.shipping_details || 'N/A';  // Get the shipping address
            const shippingMethod = session.shipping_option ? session.shipping_option.display_name : 'N/A';  // Get the shipping method

            // Retrieve the line items from the Stripe session
            const lineItems = await stripe.checkout.sessions.listLineItems(session.id);

            // Extract product information from line items
            const productsSold = lineItems.data.map(item => ({
                productName: item.description,
                quantity: item.quantity,
                price: item.amount_total / 100  // Stripe returns the price in cents
            }));

            // Save the sale details to DynamoDB
            const saleDetails = {
                userEmail: session.customer_email,  
                totalAmount: session.amount_total / 100,  
                currency: session.currency,
                paymentStatus: 'paid',
                shippingAddress: shippingDetails.address || 'N/A',  
                shippingMethod: shippingMethod || 'N/A',
                timestamp: new Date().toISOString(),
                products: productsSold  
            };

            try {
                await addOrUpdateSale(saleDetails);  
            } catch (err) {
                console.error('Error recording sale:', err);
            }
            break;

        default:
            console.log(`Unhandled event type: ${event.type}`);
    }

    // Send a response to Stripe to acknowledge receipt of the event
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
    const { cartItems, shippingDetails, totalPrice, customerEmail } = req.body;  // Extract customerEmail

    try {
        // Build line items for Stripe Checkout
        const lineItems = cartItems.map(item => {
            return {
                price_data: {
                    currency: 'cad',  // Set the currency to CAD for Canadian dollars
                    product_data: {
                        name: item.productName,
                    },
                    unit_amount: ((Math.round(item.price * 100)* 0.13)+(Math.round(item.price * 100))) ,  // Stripe requires the price in cents
                },
                quantity: item.quantity,
            };
        });

        // Create the checkout session
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: lineItems,
            mode: 'payment',
            success_url: `${process.env.FRONTEND_URL}/success?session_id={CHECKOUT_SESSION_ID}`,  // Success URL on frontend
            cancel_url: `${process.env.FRONTEND_URL}/cancel`,  // Cancel URL on frontend
            customer_email: customerEmail,  // Use the logged-in user's email
            shipping_address_collection: {
                allowed_countries: ['CA', 'US']  // Set allowed countries for shipping
            },
            shipping_options: [
                {
                    shipping_rate_data: {
                        type: 'fixed_amount',
                        fixed_amount: {
                            amount: 0, 
                            currency: 'cad',
                        },
                        display_name: 'Standard shipping',
                        delivery_estimate: {
                            minimum: {
                                unit: 'business_day',
                                value: 5,
                            },
                            maximum: {
                                unit: 'business_day',
                                value: 7,
                            },
                        },
                    },
                },
                {
                    shipping_rate_data: {
                        type: 'fixed_amount',
                        fixed_amount: {
                            amount: 1500, 
                            currency: 'cad',
                        },
                        display_name: 'Expedited shipping',
                        delivery_estimate: {
                            minimum: {
                                unit: 'business_day',
                                value: 1,
                            },
                            maximum: {
                                unit: 'business_day',
                                value: 3,
                            },
                        },
                    },
                },
            ],
        });

        // Send the session ID and URL to the frontend
        res.json({ id: session.id, url: session.url });
    } catch (error) {
        console.error('Error creating Stripe session:', error);  // Log the error to the console
        res.status(500).json({ error: 'Failed to create Stripe session' });
    }
});



