// index.js
import express  from 'express';
import cors     from 'cors';
import dotenv   from 'dotenv';
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
You are an assistant that helps generate SQL queries for a retail inventory system.
Convert the question into a SQL query compatible with PostgreSQL.

The table is 'orders' and is located in the schema 'pos'.
Relevant columns:
- order_id (integer)
- customer_id (integer)
- order_date (timestamp)
- total (numeric)
- status (text)

Only return the SQL query in a code block like this:
\`\`\`sql
SELECT * FROM pos.orders ...
\`\`\`

Question: "${question}"
`;
}

/**
 * POST /ask
 * Accepts { question } in the body, asks GPT-4 for SQL, runs it in Supabase,
 * and returns { result, sqlQuery }.
 */
app.post('/ask', async (req, res) => {
  const { question } = req.body;
  console.log('🔍 Received question:', question);

  try {
    const prompt   = buildPrompt(question);
    const gptRes   = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }],
    });
    const rawText  = gptRes.choices?.[0]?.message?.content?.trim() || '';
    const sql      = rawText.replace(/```sql|```/g, '').trim().replace(/;$/, '');
    if (!sql) throw new Error('No SQL extracted from GPT response.');

    console.log('📄 Executing SQL:', sql);
    const { data, error } = await supabase.rpc('execute_raw_sql', { sql_text: sql });
    if (error) {
      console.error('❌ Supabase error:', error);
      return res.status(500).json({ error: 'Supabase query failed', detail: error.message });
    }

    // The RPC returns an array of { result: [...] }
    const flatResult = data?.[0]?.result ?? [];
    console.log('✅ Query result:', flatResult);

    res.json({ result: flatResult, sqlQuery: sql });
  } catch (err) {
    console.error('🔥 Error in /ask:', err);
    res.status(500).json({ error: 'Failed to execute SQL', detail: err.message });
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
      .select('*');
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

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`🟢 Server running on port ${PORT}`);
});
