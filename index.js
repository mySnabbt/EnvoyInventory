const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const OpenAI = require("openai");
const supabase = require("./db");

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Formats a user's natural language question into a structured GPT prompt.
 */
const buildPrompt = (question) => `
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

app.post("/ask", async (req, res) => {
  const { question } = req.body;
  console.log("🔍 Received question:", question);

  try {
    const prompt = buildPrompt(question);
    const gptRes = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [{ role: "user", content: prompt }],
    });

    const rawText = gptRes.choices?.[0]?.message?.content?.trim();
    const sql = rawText?.replace(/```sql|```/g, "").trim().replace(/;$/, "");
    const sqlQuery = sql;

    if (!sql) throw new Error("Failed to extract SQL from GPT response.");
    console.log("📄 Cleaned SQL:\n", sql);

    const { data, error } = await supabase.rpc("execute_raw_sql", { sql_text: sql });

    if (error) {
      console.error("❌ Supabase error:", error);
      return res.status(500).json({ error: "Supabase query failed", detail: error.message });
    }

    console.log("✅ Supabase response:", data);

    const flatResult = data?.[0]?.result;
    console.log("✅ Flattened result:", flatResult);

    res.json({ result: flatResult, sqlQuery });


  } catch (err) {
    console.error("🔥 Error in /ask:", err);
    res.status(500).json({ error: "Failed to execute SQL", detail: err.message });
  }
});

app.get("/sales/today", async (req, res) => {
  try {
    const { data, error } = await supabase
      .schema("pos")
      .from("orders")
      .select("total")
      .gte("order_date", new Date().toISOString().split('T')[0]); // only today's date

    if (error) throw error;

    const totalSales = data.reduce((sum, order) => sum + (order.total || 0), 0);
    res.json({ totalSales });
  } catch (err) {
    console.error("Error fetching today's sales:", err);
    res.status(500).json({ error: "Failed to fetch today's sales" });
  }
});


app.get('/revenue/monthly', async (req, res) => {
  try {
    const { data, error } = await supabase
      .schema('pos')
      .from('orders')
      .select('total, order_date');

    if (error) throw error;

    const monthlyTotals = Array(12).fill(0); // Jan to Dec

    data.forEach(order => {
      const date = new Date(order.order_date);
      const monthIndex = date.getMonth(); // 0 = Jan, 11 = Dec
      const totalValue = parseFloat(order.total);
      if (!isNaN(totalValue)) {
        monthlyTotals[monthIndex] += totalValue;
      }
    });

    res.json({ monthlyTotals });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch monthly revenue' });
  }
});



const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🟢 Server running on port ${PORT}`);
});
