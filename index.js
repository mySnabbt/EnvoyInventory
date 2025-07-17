import dotenv from 'dotenv';
dotenv.config();
import express  from 'express';
import cors     from 'cors';       
import bcrypt   from 'bcryptjs';  
import OpenAI   from 'openai';
import supabase from './db.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Build a GPT prompt to turn a natural-language question into SQL.
 */
function buildPrompt(question) {
  return `
You are a SQL–generation assistant for a PostgreSQL retail system.
Tables:
- pos.orders       (order_id, customer_id, order_date TIMESTAMP, total, status)
- pos.order_items  (order_item_id, order_id, product_id, quantity, price_each)
- pos.products     (product_id, product_name, sku, price, stock)

Always return ONLY the SQL (no explanation), wrapped in a \`\`\`sql\`\`\` block.

Guidelines:
• If the user asks for data “on” a specific date (e.g. 2025-07-14), filter timestamps either by:
    – Applying \`DATE(order_date) = 'YYYY-MM-DD'\`
    – Or using a range: \`order_date >= 'YYYY-MM-DD 00:00:00' AND order_date < 'YYYY-MM-DD 00:00:00' + INTERVAL '1 DAY'\`
• If the user refers to an **order** by ID (e.g. “order 123”), only filter on \`o.order_id = 123\`.  
• If the user asks about **inventory** (e.g. “worth of snack 1 in inventory”), treat it as a product question: you may use \`p.stock > 0\` or compute \`p.stock * p.price\`.  
• Don’t mix inventory filters into order queries.  
• Only include the necessary columns and JOINs.  
• Use table aliases: \`o\` for orders, \`oi\` for order_items, \`p\` for products.

Question: "${question}"
`;
}


/**
 * POST /ask
 * Accepts { question } in the body, asks InventoyButler for SQL, runs it in Supabase,
 * and returns { result, sqlQuery }.
 */
app.post('/ask', async (req, res) => {
  const { question } = req.body;
  console.log('📩 Received:', question);

  const startTime = Date.now();

  try {
    // 1. Create a thread
    const thread = await openai.beta.threads.create();
    console.log('🧵 Thread created:', thread.id);

    // 2. Add user message to thread
    await openai.beta.threads.messages.create(thread.id, {
      role: 'user',
      content: question,
    });
    console.log('✉️ Message added to thread.');

    // 3. Run the assistant on the thread
    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: process.env.OPENAI_ASSISTANT_ID,
    });
    console.log('🚀 Run started:', run.id);

    // 4. Poll for completion
    let runStatus = run.status;
    while (runStatus !== 'completed' && runStatus !== 'failed') {
      await new Promise(r => setTimeout(r, 1000));
      const updatedRun = await openai.beta.threads.runs.retrieve(thread.id, run.id);
      runStatus = updatedRun.status;
      console.log(`🔄 Run status: ${runStatus}`);
    }

    if (runStatus === 'failed') {
      throw new Error('Assistant run failed.');
    }

    // 5. Retrieve assistant’s latest response
    const messages = await openai.beta.threads.messages.list(thread.id);
    const latest = messages.data.find(m => m.role === 'assistant')?.content?.[0]?.text?.value || '';
    console.log('💬 Assistant response:', latest);

    // 6. Extract SQL
    let sql = '';
    const match = latest.match(/```sql([\s\S]*?)```/i);
    if (match) {
      sql = match[1].trim();
    } else {
      const idx = latest.toUpperCase().indexOf('SELECT');
      sql = idx >= 0 ? latest.slice(idx).trim() : latest.trim();
    }
    sql = sql.replace(/;$/, '');
    if (!sql) throw new Error('❌ No SQL found in assistant response.');
    console.log('📄 Extracted SQL:', sql);

    // 7. Run it on Supabase
    const { data, error } = await supabase.rpc('execute_raw_sql', { sql_text: sql });
    if (error) {
      console.error('❌ Supabase error:', error);
      return res.status(500).json({ error: 'Supabase query failed', detail: error.message });
    }

    console.log(`📊 Supabase returned ${data?.[0]?.result?.length ?? 0} rows.`);

    const endTime = Date.now();
    console.log(`✅ Request completed in ${endTime - startTime}ms`);

    res.json({ result: data?.[0]?.result ?? [], sqlQuery: sql });

  } catch (err) {
    console.error('🔥 Assistant error:', err);
    res.status(500).json({ error: 'Failed to process request', detail: err.message });
  }
});



/**
 * GET /sales?date=YYYY-MM-DD
 * Returns { totalSales } for that exact date (defaults to today).
 */
app.get('/sales', async (req, res) => {
  try {
    // 1) Determine the requested date (YYYY-MM-DD), defaulting to today
    const dateString = req.query.date || new Date().toISOString().split('T')[0];

    // 2) Build start-of-day and end-of-day timestamps
    const start = new Date(dateString);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    // 3) Fetch all orders on that date
    const { data, error } = await supabase
      .schema('pos')
      .from('orders')
      .select('total')
      .gte('order_date', start.toISOString())
      .lt('order_date', end.toISOString());

    if (error) throw error;

    // 4) Sum the totals
    const totalSales = data.reduce((sum, row) => sum + (row.total || 0), 0);
    res.json({ totalSales });
  } catch (err) {
    console.error('Error fetching sales for date:', err);
    res.status(500).json({ error: 'Failed to fetch sales' });
  }
});


/**
 * GET /products
 * Returns { products: [...] } of all rows in pos.products.
 */
app.get('/products', async (req, res) => {
  try {
    const { data, error } = await supabase
      .schema('pos')
      .from('products')
      .select('*')
      .eq('is_active', true);
    if (error) throw error;
    res.json({ products: data });
  } catch (err) {
    console.error('Error fetching products:', err);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

/**
 * GET /revenue/monthly
 * Returns { monthlyTotals: [Jan…Dec] } sums of pos.orders.total by month.
 */
app.get('/revenue/monthly', async (req, res) => {
  try {
    const { data, error } = await supabase
      .schema('pos')
      .from('orders')
      .select('total, order_date');
    if (error) throw error;

    const monthlyTotals = Array(12).fill(0);
    data.forEach(order => {
      const m = new Date(order.order_date).getMonth();
      const v = parseFloat(order.total);
      if (!isNaN(v)) monthlyTotals[m] += v;
    });

    res.json({ monthlyTotals });
  } catch (err) {
    console.error('Error fetching monthly revenue:', err);
    res.status(500).json({ error: 'Failed to fetch monthly revenue' });
  }
});
// GET /users — list all users
app.get('/users', async (req, res) => {
  try {
    const { data, error } = await supabase
      .schema('pos')
      .from('users')
      .select('user_id, first_name, last_name, email, designation');
    if (error) throw error;
    res.json({ users: data });
  } catch (err) {
    console.error('Error fetching users:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// POST /users — add a new user
/**
 * POST /users
 * Body: { first_name, last_name, email, designation, plainPassword }
 * Inserts a new user with a bcrypt-hashed password.
 */
app.post('/users', async (req, res) => {
  try {
    const {
      first_name,
      last_name,
      email,
      designation,
      plainPassword,
      role_id
    } = req.body;

    // 1. Validate required fields
    if (!first_name || !last_name || !email || !plainPassword) {
      return res
        .status(400)
        .json({ error: 'first_name, last_name, email and password are required' });
    }

    // 2. Hash the password
    const password_hash = await bcrypt.hash(plainPassword, 10);

    // 3. Default role_id to 1 if missing
    const newRoleId = role_id ?? 1;

    // 4. Insert into pos.users
    const { data, error } = await supabase
      .schema('pos')
      .from('users')
      .insert({
        first_name,
        last_name,
        email,
        designation,
        password_hash,
        role_id: newRoleId
      })
      .select('user_id, first_name, last_name, email, designation, role_id')
      .single();

    if (error) throw error;

    // 5. Return the created user (sans hash)
    res.status(201).json({ user: data });
  } catch (err) {
    console.error('Error creating user:', err);
    res
      .status(500)
      .json({ error: 'Failed to create user', detail: err.message });
  }
});

// PATCH /users/:id — update designation
app.patch('/users/:id', async (req, res) => {
  try {
    const {
      user_id,
      first_name,
      last_name,
      email,
      designation,
      plainPassword
    } = req.body;

    // Build an updates object containing only the fields they actually sent
    const updates = {};
    if (user_id && user_id !== Number(req.params.id)) {
      updates.user_id = user_id;
    }
    if (first_name)  updates.first_name  = first_name;
    if (last_name)   updates.last_name   = last_name;
    if (email)       updates.email       = email;
    if (designation) updates.designation = designation;

    // If they provided a new password, hash it
    if (plainPassword) {
      updates.password_hash = await bcrypt.hash(plainPassword, 10);
    }

    // Make sure there's something to update
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    // Perform the update
    const { data, error } = await supabase
      .schema('pos')
      .from('users')
      .update(updates)
      .eq('user_id', req.params.id)
      .select('user_id, first_name, last_name, email, designation')
      .single();

    if (error) throw error;

    res.json({ user: data });
  } catch (err) {
    console.error('Error updating user:', err);
    res.status(500).json({ error: 'Failed to update user', detail: err.message });
  }
});

// DELETE /users/:id — remove a user
app.delete('/users/:id', async (req, res) => {
  try {
    const { error } = await supabase
      .schema('pos')
      .from('users')
      .delete()
      .eq('user_id', req.params.id);
    if (error) throw error;
    res.status(204).end();
  } catch (err) {
    console.error('Error deleting user:', err);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});


// GET /orders/:orderId/items  — list all items for a specific order
// GET /orders/:orderId/items 
app.get('/orders/:orderId/items', async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const { data, error } = await supabase
      .schema('pos')
      .from('order_items')
      .select(`
        order_item_id,
        product_id,
        quantity,
        price_each,
        products (
          product_name
        )
      `)
      .eq('order_id', orderId);

    if (error) throw error;
    res.json({ orderItems: data });
  } catch (err) {
    console.error('Error fetching order items:', err);
    res.status(500).json({ error: 'Failed to fetch order items', detail: err.message });
  }
});

// POST   /products         — create a new product
app.post('/products', async (req, res) => {
  try {
    const { product_name, sku, category_id, price, stock } = req.body;
    if (!product_name || !sku || price == null || stock == null) {
      return res.status(400).json({ error: 'product_name, sku, price and stock are required' });
    }

    const { data, error } = await supabase
      .schema('pos')
      .from('products')
      .insert({ product_name, sku, category_id, price, stock })
      .select('*')
      .single();

    if (error) throw error;
    res.status(201).json({ product: data });
  } catch (err) {
    console.error('Error creating product:', err);
    res.status(500).json({ error: 'Failed to create product', detail: err.message });
  }
});

// PATCH  /products/:id     — update an existing product
app.patch('/products/:id', async (req, res) => {
  try {
    const updates = {};
    ['product_name','sku','category_id','price','stock'].forEach(field => {
      if (req.body[field] != null) updates[field] = req.body[field];
    });
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No updatable fields provided' });
    }

    const { data, error } = await supabase
      .schema('pos')
      .from('products')
      .update(updates)
      .eq('product_id', req.params.id)
      .select('*')
      .single();

    if (error) throw error;
    res.json({ product: data });
  } catch (err) {
    console.error('Error updating product:', err);
    res.status(500).json({ error: 'Failed to update product', detail: err.message });
  }
});


// “Delete” => soft delete
app.delete('/products/:id', async (req, res) => {
  try {
    const { error } = await supabase
      .schema('pos')
      .from('products')
      .update({ is_active: false })
      .eq('product_id', req.params.id);

    if (error) throw error;
    return res.status(204).end();
  } catch (err) {
    console.error('Error soft-deleting product:', err);
    return res.status(500).json({ error: 'Failed to delete product', detail: err.message });
  }
});




const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`🟢 Server running on port ${PORT}`);
});
