import dotenv from 'dotenv';
dotenv.config();
import express  from 'express';
import cors     from 'cors';       
import bcrypt   from 'bcryptjs';  
import OpenAI   from 'openai';
import supabase from './db.js';
import jwt from 'jsonwebtoken'
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function unwrapExecuteResult(data) {
  // If the RPC already returned the array
  if (Array.isArray(data)) return data;

  // If you ever call the function via SELECT execute_analytics_sql(...) AS execute_analytics_sql
  if (data && Array.isArray(data.execute_analytics_sql)) return data.execute_analytics_sql;

  // If the driver coerced JSONB into a string (rare), try to parse
  if (data && typeof data.execute_analytics_sql === 'string') {
    try {
      const arr = JSON.parse(data.execute_analytics_sql);
      if (Array.isArray(arr)) return arr;
    } catch { /* ignore */ }
  }
  return [];
}


function requireRole(...allowedRoles) {
  return (req, res, next) => {
    let role = req.user?.role;
    if (typeof role === 'string') {
      role = parseInt(role, 10);
    }
    if (!role || !allowedRoles.includes(role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}


app.patch(
  '/users/:id',
  authenticate,
  requireRole(2, 3),
  async (req, res) => {
    const targetId = Number(req.params.id);
    // 1) fetch the target user to see their current role
    const { data: target, error: fetchErr } = await supabase
      .schema('pos')
      .from('users')
      .select('role_id')
      .eq('user_id', targetId)
      .single();

    if (fetchErr) return res.status(500).json({ error: fetchErr.message });

    // 2) if a manager (2) tries to edit an admin (3), forbid
    if (req.user.role === 2 && target.role_id === 3) {
      return res.status(403).json({ error: 'Cannot edit administrator' });
    }

    // 3) if a manager tries to set someone to admin, forbid
    if (
      req.user.role === 2 &&
      req.body.role_id === 3
    ) {
      return res.status(403).json({ error: 'Managers cannot assign Administrator' });
    }

    // 4) now proceed with building your updates object
    const updates = {};
    if (req.body.first_name) updates.first_name = req.body.first_name;
    if (req.body.last_name)  updates.last_name  = req.body.last_name;
    if (req.body.designation) updates.designation = req.body.designation;
    if (req.body.plainPassword) {
      updates.password_hash = await bcrypt.hash(req.body.plainPassword, 10);
    }
    if (req.body.role_id) {
      updates.role_id = req.body.role_id;
    }
    // … validate at least one field to update …

    // 5) perform the update
    const { data, error } = await supabase
      .schema('pos')
      .from('users')
      .update(updates)
      .eq('user_id', targetId)
      .select('user_id, first_name, last_name, email, designation, role_id')
      .single();

    if (error) throw error;
    res.json({ user: data });
  }
);




app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  const { data: user, error } = await supabase
    .schema('pos')
    .from('users')
    .select(
      'user_id, first_name, last_name, email, password_hash, role_id, designation, avatar_path'
    )
    .eq('email', email)
    .single();

  if (error || !user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign(
    { sub: user.user_id, email: user.email, role: user.role_id },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );

  const avatar_url = getAvatarPublicUrl(user.avatar_path);

  res.json({
    token,
    user: {
      user_id: user.user_id,
      first_name: user.first_name,
      last_name: user.last_name,
      email: user.email,
      designation: user.designation,
      role_id: user.role_id,
      avatar_url,
    },
  });
});


function authenticate(req, res, next) {
  const auth = req.headers.authorization || '';
  const parts = auth.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return res.status(401).end();

  try {
    const payload = jwt.verify(parts[1], process.env.JWT_SECRET);
    req.user = payload;    // you can read req.user.sub and req.user.role later
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}



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
    const { data, error } = await supabase.rpc('execute_analytics_sql', { p_sql: sql });
    if (error) {
      console.error('❌ Supabase error:', error);
      return res.status(500).json({ error: 'Supabase query failed', detail: error.message });
    }

    const rows = unwrapExecuteResult(data);
    console.log(`📊 Supabase returned ${rows.length} rows.`);

    const endTime = Date.now();
    console.log(`✅ Request completed in ${endTime - startTime}ms`);

    // Return the unwrapped rows
    res.json({ result: rows, sqlQuery: sql });

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
// GET /users — list all users
app.get('/users', authenticate,
  async (req, res) => {
    try {
      const { data, error } = await supabase
        .schema('pos')
        .from('users')
        .select('user_id, first_name, last_name, email, designation, role_id');
      if (error) throw error;
      res.json({ users: data });
    } catch (err) {
      console.error('Error fetching users:', err);
      res.status(500).json({ error: 'Failed to fetch users' });
    }
  }
);


// POST /users — add a new user
/**
 * POST /users
 * Body: { first_name, last_name, email, designation, plainPassword }
 * Inserts a new user with a bcrypt-hashed password.
 */
app.post('/users', authenticate,
  requireRole(2, 3), 
  async (req, res) => {
     if (req.user.role === 2 && req.body.role_id === 3) {
      return res.status(403).json({ error: 'Managers cannot assign Administrator' });
    }
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
app.post('/products', authenticate, requireRole(2, 3), async (req, res) => {
  console.log('🔍 Received product:', req.body);
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
// PATCH  /products/:id
app.patch('/products/:id', authenticate, requireRole(2, 3), async (req, res) => {
  try {
    const updates = {};
    const updatable = ['product_name','sku','category_id','price','stock','is_active']; // ← add is_active

    updatable.forEach((field) => {
      if (req.body[field] != null) updates[field] = req.body[field];
    });

    // type coercion
    if (updates.price != null) updates.price = Number(updates.price);
    if (updates.stock != null) updates.stock = Number(updates.stock);
    if (updates.category_id != null) updates.category_id = Number(updates.category_id);
    if (updates.is_active != null) updates.is_active = !!updates.is_active;

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

// GET /inventory
app.get('/inventory', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase
      .schema('pos')
      .from('products')
      .select(`
        product_id,
        product_name,
        sku,
        stock,
        product_vendors (
          supply_price,
          lead_time_days,
          preferred,
          vendor_id,
          vendors (
            vendor_name
          )
        )
      `)
      .eq('is_active', true);

    if (error) throw error;

    // Flatten data into rows for table
    const inventory = data.map(p => {
      const vendorInfo = p.product_vendors?.[0] || {};
      return {
        product_id: p.product_id,
        product_name: p.product_name,
        sku: p.sku,
        stock: p.stock,
        supply_price: vendorInfo.supply_price || null,
        lead_time_days: vendorInfo.lead_time_days || null,
        preferred: vendorInfo.preferred || false,
        vendor_id: vendorInfo.vendor_id || null,
        vendor_name: vendorInfo.vendors?.vendor_name || null
      };
    });

    res.json({ inventory });
  } catch (err) {
    console.error('Error fetching inventory:', err);
    res.status(500).json({ error: 'Failed to fetch inventory' });
  }
});

// PATCH /inventory/:productId/vendor — upsert or update vendor link for a product
app.patch('/inventory/:productId/vendor', authenticate, async (req, res) => {
  try {
    const productId = Number(req.params.productId);
    const { vendor_id, preferred, lead_time_days } = req.body;

    if (!productId || !vendor_id) {
      return res.status(400).json({ error: 'productId and vendor_id are required' });
    }

    // 1) Upsert/insert the row for this product/vendor
    const upsertPayload = {
      product_id: productId,
      vendor_id,
      preferred: !!preferred,
      lead_time_days: lead_time_days ?? null
    };

    const { data: upsertData, error: upsertErr } = await supabase
      .schema('pos')
      .from('product_vendors')
      .upsert(upsertPayload, { onConflict: 'product_id,vendor_id' })
      .select('*');

    if (upsertErr) throw upsertErr;

    // 2) If this vendor is marked preferred, unset preferred for the rest
    if (preferred === true) {
      const { error: clearErr } = await supabase
        .schema('pos')
        .from('product_vendors')
        .update({ preferred: false })
        .eq('product_id', productId)
        .neq('vendor_id', vendor_id);

      if (clearErr) throw clearErr;
    }

    res.json({ ok: true, vendorLink: upsertData?.[0] ?? null });
  } catch (err) {
    console.error('Update vendor link failed:', err);
    res.status(500).json({ error: 'Failed to update vendor for product' });
  }
});



// GET /vendors
app.get('/vendors', authenticate, async (req, res) => {
  try {
    const active = req.query.active; // 'true' | 'false' | 'all' | undefined
    let q = supabase
      .schema('pos')
      .from('vendors')
      .select('*');

    if (active === 'true') {
      q = q.eq('is_active', true);
    } else if (active === 'false') {
      q = q.eq('is_active', false);
    }
    // else: return all vendors

    const { data, error } = await q;

    if (error) throw error;

    res.json({ vendors: data });
  } catch (err) {
    console.error('Error fetching vendors:', err);
    res.status(500).json({ error: err.message });
  }
});



// POST /inventory/order — create restock order
// FILE: backend/index.js (replace only the /inventory/order route)

app.post('/inventory/order', authenticate, async (req, res) => {
  try {
    const { product_id, vendor_id, quantity } = req.body;
    const user_id = req.user?.sub; // numeric user_id from your JWT

    if (!product_id || !quantity) {
      return res.status(400).json({ error: 'product_id and quantity are required' });
    }

    // Build minimal payload; let DB defaults handle status/timestamps
    const payload = {
      product_id,
      vendor_id: vendor_id ?? null,
      quantity,
      requested_by: user_id ?? null // BIGINT if you applied the schema change above
    };

    const { data, error } = await supabase
      .schema('pos')
      .from('restock_orders')
      .insert(payload)
      .select('*')
      .single();

    if (error) throw error;

    return res.status(201).json({ order: data });
  } catch (err) {
    console.error('Order failed:', err.message);
    return res.status(500).json({ error: err.message });
  }
});



// GET /vendors — only active
app.get('/vendors', authenticate, async (req, res) => {
  const { data, error } = await supabase
    .schema('pos')
    .from('vendors')
    .select('*')
    .eq('is_active', true); // ✅ only active
  if (error) return res.status(500).json({ error: error.message });
  res.json({ vendors: data });
});

// POST /vendors — create new vendor
app.post('/vendors', authenticate, async (req, res) => {
  const { vendor_name, contact_email, contact_phone, address } = req.body;

  if (!vendor_name || vendor_name.trim() === '') {
    return res.status(400).json({ error: 'Vendor name is required' });
  }

  try {
    const { data, error } = await supabase
      .schema('pos')
      .from('vendors')
      .insert({
        vendor_name: vendor_name.trim(),
        contact_email: contact_email || null,
        contact_phone: contact_phone || null,
        address: address || null
      })
      .select('*')
      .single();

    if (error) throw error;

    res.status(201).json({ vendor: data });
  } catch (err) {
    console.error('Error creating vendor:', err);
    res.status(500).json({ error: 'Failed to create vendor', detail: err.message });
  }
});


// PATCH /vendors/:id — update existing vendor
app.patch('/vendors/:id', authenticate, async (req, res) => {
  const updates = {};

  ['vendor_name', 'contact_email', 'contact_phone', 'address', 'is_active'].forEach(field => {
    if (req.body[field] != null) {
      updates[field] = req.body[field];
    }
  });

  const { data, error } = await supabase
    .schema('pos')
    .from('vendors')
    .update(updates)
    .eq('vendor_id', req.params.id)
    .select('*')
    .single();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json({ vendor: data });
});


// DELETE /vendors/:id — soft delete
app.delete('/vendors/:id', authenticate, async (req, res) => {
  const { error } = await supabase
    .schema('pos')
    .from('vendors')
    .update({ is_active: false })
    .eq('vendor_id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.status(204).end();
});

// GET /restock/orders — list only non-completed
app.get('/restock/orders', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase
      .schema('pos')
      .from('restock_orders')
      .select(`
        restock_id,
        product_id,
        vendor_id,
        quantity,
        status,
        requested_by,
        requested_at,
        updated_at,
        expected_delivery,
        products:product_id(product_name),
        vendors:vendor_id(vendor_name)
      `)
      .neq('status', 'COMPLETED') // hide completed
      .order('requested_at', { ascending: false });

    if (error) throw error;

    return res.json({ orders: data || [] });
  } catch (err) {
    console.error('Error fetching restock orders:', err);
    return res.status(500).json({ error: 'Failed to fetch restock orders' });
  }
});


// GET /restock/deliveries — list restock deliveries (newer first)
app.get('/restock/deliveries', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase
      .schema('pos')
      .from('restock_deliveries')
      .select(`
        delivery_id,
        restock_id,
        product_id,
        quantity_received,
        received_at,
        notes,
        products:product_id ( product_name )
      `)
      .order('received_at', { ascending: false });

    if (error) throw error;
    res.json({ deliveries: data || [] });
  } catch (err) {
    console.error('Error fetching restock deliveries:', err);
    res.status(500).json({ error: 'Failed to fetch restock deliveries' });
  }
});

// POST /restock/orders/:id/deliver
app.post(
  '/restock/orders/:id/deliver',
  authenticate,
  requireRole(2, 3),
  async (req, res) => {
    try {
      const restockId = Number(req.params.id);
      if (!restockId) {
        return res.status(400).json({ error: 'Invalid restock id' });
      }

      const notes = req.body?.notes ?? null;

      const { data, error } = await supabase.rpc(
        'pos_mark_restock_order_delivered',
        {
          p_restock_id: restockId,
          p_notes: notes,
        }
      );

      if (error) throw error;

      return res.json({ delivery: data });
    } catch (err) {
      console.error('Deliver restock order failed:', err);
      return res.status(500).json({
        error: 'Failed to mark delivered',
        detail: err.message,
      });
    }
  }
);


// GET /inventory/worth — total retail value of active inventory
app.get('/inventory/worth', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase
      .schema('pos')
      .from('products')
      .select('price, stock')
      .eq('is_active', true);

    if (error) throw error;

    const totalWorth = (data || []).reduce((sum, p) => {
      const price = Number(p.price ?? 0);
      const stock = Number(p.stock ?? 0);
      if (Number.isFinite(price) && Number.isFinite(stock)) {
        return sum + price * stock;
      }
      return sum;
    }, 0);

    res.json({ totalWorth });
  } catch (err) {
    console.error('Error computing inventory worth:', err);
    res.status(500).json({ error: 'Failed to compute inventory worth' });
  }
});

app.get('/products/inactive', async (req, res) => {
  try {
    const { data, error } = await supabase
      .schema('pos')
      .from('products')
      .select('*')
      .eq('is_active', false);

    if (error) throw error;

    res.json({ products: data });
  } catch (err) {
    console.error('Error fetching inactive products:', err);
    res.status(500).json({ error: 'Failed to fetch inactive products' });
  }
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB
  },
});

function getAvatarPublicUrl(path) {
  if (!path) return null;

  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  return data?.publicUrl || null;
}

app.get('/me', authenticate, async (req, res) => {
  try {
    const { data: user, error } = await supabase
      .schema('pos')
      .from('users')
      .select(
        'user_id, first_name, last_name, email, designation, role_id, avatar_path'
      )
      .eq('user_id', req.user.sub)
      .single();

    if (error) throw error;

    const avatar_url = getAvatarPublicUrl(user.avatar_path);
    res.json({ user: { ...user, avatar_url } });

  } catch (err) {
    console.error('GET /me failed:', err);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

app.post(
  '/users/:id/avatar',
  authenticate,
  upload.single('avatar'),
  async (req, res) => {
    try {
      const targetId = Number(req.params.id);
      if (!targetId) {
        return res.status(400).json({ error: 'Invalid user id' });
      }

      // Only self or manager/admin can update
      const callerRole = Number(req.user.role);
      const isSelf = req.user.sub === targetId;
      if (!isSelf && !(callerRole === 2 || callerRole === 3)) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const bytes = req.file.buffer;
      const mime = req.file.mimetype || 'image/jpeg';
      const ext =
        (req.file.originalname || '').split('.').pop()?.toLowerCase() || 'jpg';

      // Optional: basic MIME guard
      if (!['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(mime)) {
        return res.status(400).json({ error: 'Unsupported image type' });
      }

      // Make a unique key per user; upsert to replace in-place
      const key = `user_${targetId}/${uuidv4()}.${ext}`;

      // Upload
      const { error: upErr } = await supabase.storage
        .from('avatars')
        .upload(key, bytes, { contentType: mime, upsert: true });

      if (upErr) throw upErr;

      // Fetch previous avatar_path to delete old file
      const { data: prev, error: prevErr } = await supabase
        .schema('pos')
        .from('users')
        .select('avatar_path')
        .eq('user_id', targetId)
        .single();

      if (prevErr) throw prevErr;

      // Save new path
      const { error: updErr } = await supabase
        .schema('pos')
        .from('users')
        .update({ avatar_path: key, avatar_updated_at: new Date().toISOString() })
        .eq('user_id', targetId);

      if (updErr) throw updErr;

      // Delete previous file (best-effort)
      if (prev?.avatar_path && prev.avatar_path !== key) {
        await supabase.storage.from('avatars').remove([prev.avatar_path]);
      }

      const avatar_url = getAvatarPublicUrl(key);
      res.json({ avatar_url });
    } catch (err) {
      console.error('Upload avatar failed:', err);
      res.status(500).json({ error: 'Failed to upload avatar', detail: err.message });
    }
  }
);

app.delete(
  '/users/:id/avatar',
  authenticate,
  async (req, res) => {
    try {
      const targetId = Number(req.params.id);
      if (!targetId) {
        return res.status(400).json({ error: 'Invalid user id' });
      }

      // Only self or manager/admin can delete
      const callerRole = Number(req.user.role);
      const isSelf = req.user.sub === targetId;
      if (!isSelf && !(callerRole === 2 || callerRole === 3)) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      // Fetch current avatar
      const { data: user, error } = await supabase
        .schema('pos')
        .from('users')
        .select('avatar_path')
        .eq('user_id', targetId)
        .single();

      if (error) throw error;

      // Delete file from storage if exists
      if (user?.avatar_path) {
        await supabase.storage.from('avatars').remove([user.avatar_path]);
      }

      // Clear avatar_path in database
      const { error: updErr } = await supabase
        .schema('pos')
        .from('users')
        .update({ avatar_path: null, avatar_updated_at: new Date().toISOString() })
        .eq('user_id', targetId);

      if (updErr) throw updErr;

      res.json({ ok: true });
    } catch (err) {
      console.error('Delete avatar failed:', err);
      res.status(500).json({ error: 'Failed to delete avatar', detail: err.message });
    }
  }
);

// GET /inventory/stock-by-category?metric=units|value
// Returns { metric, labels, data, breakdown[] }
app.get('/inventory/stock-by-category', authenticate, async (req, res) => {
  try {
    const metric = (req.query.metric || 'units').toLowerCase(); // 'units' or 'value'

    // Fetch minimal product fields
    const [{ data: products, error: pErr }, { data: cats, error: cErr }] = await Promise.all([
      supabase
        .schema('pos')
        .from('products')
        .select('category_id, stock, price, is_active')
        .eq('is_active', true),
      supabase
        .schema('pos')
        .from('categories')
        .select('category_id, category_name')
    ]);

    if (pErr) throw pErr;
    if (cErr) throw cErr;

    const nameForId = new Map((cats || []).map(c => [c.category_id, c.category_name]));
    const UNCATEGORIZED = 'Uncategorized';

    // Aggregate
    const agg = new Map(); // name -> { name, units, value }
    for (const p of products || []) {
      const name = nameForId.get(p.category_id) || UNCATEGORIZED;
      const stock = Number(p.stock ?? 0);
      const price = Number(p.price ?? 0);

      if (!agg.has(name)) agg.set(name, { name, units: 0, value: 0 });
      const slot = agg.get(name);
      slot.units += Number.isFinite(stock) ? stock : 0;
      slot.value += (Number.isFinite(stock) && Number.isFinite(price)) ? stock * price : 0;
    }

    // Build response sorted by selected metric (desc)
    const breakdown = Array.from(agg.values()).sort((a, b) =>
      (metric === 'value' ? b.value - a.value : b.units - a.units)
    );

    const labels = breakdown.map(x => x.name);
    const data = breakdown.map(x => metric === 'value'
      ? Number(x.value.toFixed(2))
      : x.units
    );

    res.json({ metric, labels, data, breakdown });
  } catch (err) {
    console.error('Error computing stock-by-category:', err);
    res.status(500).json({ error: 'Failed to compute stock by category' });
  }
});




const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`🟢 Server running on port ${PORT}`);
});
