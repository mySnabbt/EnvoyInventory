const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const OpenAI = require("openai");
const supabase = require("./db");

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

app.post("/ask", async (req, res) => {
  const { question } = req.body;
  console.log("Received question:", question);

  try {
    const prompt = `
You are an assistant that helps generate SQL queries for a retail inventory system. Convert the question into a SQL query compatible with PostgreSQL.
The table is 'orders' and it is located in the schema 'pos'.
The relevant columns in 'orders' are:
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

    const gptRes = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [{ role: "user", content: prompt }],
    });

    const rawText = gptRes.choices?.[0]?.message?.content?.trim();
    console.log("Raw GPT response:\n", rawText);

    const sql = rawText.replace(/```sql|```/g, "").trim().replace(/;$/, "");
    console.log("Cleaned SQL:\n", sql);

    console.log("Sending SQL to Supabase RPC...");
    const { data, error } = await supabase.rpc('execute_raw_sql', { sql_text: sql });

    if (error) {
      console.error("Supabase error:", error);
      return res.status(500).json({ error: "Supabase query failed", detail: error.message });
    }

    const unpacked = data?.[0]?.result?.[0]; // safely unpack the JSON array inside
    console.log("Received response from Supabase:", unpacked);
    return res.json({ result: unpacked });

  } catch (err) {
    console.error("Error in /ask:", err);
    res.status(500).json({ error: "Failed to execute SQL", detail: err.message });
  }
});

app.listen(5000, () => {
  console.log("Server running on port 5000");
});
